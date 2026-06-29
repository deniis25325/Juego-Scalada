import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient'

const useGameStore = create((set, get) => ({
  phase: 'ready',   // 'ready' | 'playing' | 'paused' | 'dead'
  score: 0,         // current score (= max height in meters)
  height: 0,        // current height (can decrease as player falls)
  highScore: 0,
  multiplayer: false,
  scenario: 'default', // 'default' | 'fog' | 'neon' | 'dark'
  isTransitioning: false,
  checkpointPos: [0, -0.25, 0],
  levelVersion: 0,

  // Supabase states
  user: null,
  profile: null,
  authLoading: false,
  authModalOpen: false,
  leaderboardModalOpen: false,
  leaderboard: [],
  history: [],
  saveScoreStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error'
  reviveCount: 0,

  // Mobile virtual controls states
  joystickX: 0,
  joystickY: 0,
  touchJump: false,

  // Online Multiplayer States
  multiplayerMode: 'none', // 'none' | 'local' | 'online'
  isHost: false,
  activeRoom: null,
  matchmakingStatus: 'idle', // 'idle' | 'searching' | 'found' | 'room_created' | 'playing' | 'disconnected'
  remotePlayerState: null,
  lastPacketTimestamp: 0,

  startGame: () => {
    set((state) => ({ 
      phase: 'playing', 
      score: 0, 
      height: 0, 
      checkpointPos: [0, -0.25, 0], 
      levelVersion: state.levelVersion + 1, 
      saveScoreStatus: 'idle', 
      reviveCount: 0 
    }));
    get().initGameRoomChannel();
  },

  gameOver: () => {
    const { score, highScore, user, saveScoreToSupabase } = get()
    set({ phase: 'dead', highScore: Math.max(score, highScore) })
    if (user) {
      saveScoreToSupabase(score)
    }
  },

  restart: () => set((state) => ({ phase: 'playing', score: 0, height: 0, checkpointPos: [0, -0.25, 0], levelVersion: state.levelVersion + 1, saveScoreStatus: 'idle', reviveCount: 0 })),

  continueGame: () => set((state) => ({ phase: 'playing', reviveCount: state.reviveCount + 1, saveScoreStatus: 'idle' })),

  setHeight: (h) => {
    const rounded = Math.max(0, Math.floor(h))
    set((state) => ({
      height: rounded,
      // score = highest point ever reached in this run
      score: Math.max(state.score, rounded),
    }))
  },

  setMultiplayerMode: (mode) => set({ 
    multiplayerMode: mode,
    multiplayer: mode === 'local' || mode === 'online'
  }),
  setScenario: (val) => set({ scenario: val }),
  setTransitioning: (val) => set({ isTransitioning: val }),

  togglePause: () => set((state) => ({
    phase: state.phase === 'playing' ? 'paused' : state.phase === 'paused' ? 'playing' : state.phase
  })),

  setCheckpoint: (pos) => set({ checkpointPos: pos }),

  exitToMenu: () => set({ 
    phase: 'ready', 
    score: 0, 
    height: 0, 
    checkpointPos: [0, -0.25, 0], 
    saveScoreStatus: 'idle',
    multiplayerMode: 'none',
    multiplayer: false,
    activeRoom: null,
    isHost: false,
    matchmakingStatus: 'idle',
    remotePlayerState: null
  }),

  // Supabase Actions
  setAuthModalOpen: (val) => set({ authModalOpen: val }),
  setLeaderboardModalOpen: (val) => set({ leaderboardModalOpen: val }),
  setJoystick: (x, y) => set({ joystickX: x, joystickY: y }),
  setTouchJump: (val) => set({ touchJump: val }),

  // Online Multiplayer Database Actions
  startMatchmaking: async () => {
    const user = get().user
    if (!user) return
    
    set({ matchmakingStatus: 'searching' })
    
    // 1. Limpiar colas antiguas de este usuario
    if (isSupabaseConfigured) {
      try {
        await supabase.from('matchmaking_queue').delete().eq('player_id', user.id)
      } catch (e) {
        console.error(e)
      }
    }
    
    if (!isSupabaseConfigured) {
      // Modo local simulado de matchmaking si no hay credenciales
      setTimeout(() => {
        set({ matchmakingStatus: 'playing', multiplayerMode: 'online', multiplayer: true, isHost: true })
        get().startGame()
      }, 2000)
      return
    }
    
    // 2. Insertar en la cola
    const { data: queueRow, error: queueErr } = await supabase
      .from('matchmaking_queue')
      .insert({ player_id: user.id, status: 'searching' })
      .select()
      .single()
      
    if (queueErr) {
      console.error(queueErr)
      set({ matchmakingStatus: 'idle' })
      return
    }
    
    // 3. Suscribirse a cambios en su fila
    const matchmakingSubscription = supabase
      .channel(`match_${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'matchmaking_queue',
        filter: `player_id=eq.${user.id}`
      }, async (payload) => {
        if (payload.new.status === 'matched') {
          const roomId = payload.new.room_id
          const { data: room } = await supabase.from('rooms').select().eq('id', roomId).single()
          if (room) {
            set({
              activeRoom: room,
              isHost: room.host_id === user.id,
              matchmakingStatus: 'playing',
              multiplayerMode: 'online',
              multiplayer: true
            })
            await supabase.from('matchmaking_queue').delete().eq('player_id', user.id)
            get().startGame()
          }
        }
      })
      .subscribe()
      
    window.matchmakingSubscription = matchmakingSubscription
    
    // 4. Buscar a otro jugador en espera
    const { data: searchList } = await supabase
      .from('matchmaking_queue')
      .select()
      .eq('status', 'searching')
      .neq('player_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      
    if (searchList && searchList.length > 0) {
      const opponent = searchList[0]
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const seed = Math.floor(Math.random() * 1000000)
      
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          id: roomId,
          host_id: opponent.player_id,
          player_2_id: user.id,
          status: 'ready',
          map_seed: seed,
          player_count: 2
        })
        .select()
        .single()
        
      if (!roomErr && room) {
        await supabase.from('matchmaking_queue').update({ status: 'matched', room_id: roomId }).eq('player_id', opponent.player_id)
        await supabase.from('matchmaking_queue').update({ status: 'matched', room_id: roomId }).eq('player_id', user.id)
      }
    }
  },
  
  cancelMatchmaking: async () => {
    const user = get().user
    set({ matchmakingStatus: 'idle' })
    
    if (window.matchmakingSubscription) {
      if (isSupabaseConfigured) {
        supabase.removeChannel(window.matchmakingSubscription)
      }
      window.matchmakingSubscription = null
    }
    
    if (user && isSupabaseConfigured) {
      try {
        await supabase.from('matchmaking_queue').delete().eq('player_id', user.id)
      } catch (e) {}
    }
  },
  
  createPrivateRoom: async () => {
    const user = get().user
    if (!user) return
    
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    const seed = Math.floor(Math.random() * 1000000)
    
    set({ matchmakingStatus: 'searching', isHost: true })
    
    if (!isSupabaseConfigured) {
      // Modo simulación sin Supabase
      set({ 
        activeRoom: { id: roomId, host_id: user.id, status: 'waiting', map_seed: seed, player_count: 1 } 
      })
      return
    }
    
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        id: roomId,
        host_id: user.id,
        status: 'waiting',
        map_seed: seed,
        player_count: 1
      })
      .select()
      .single()
      
    if (error) {
      console.error(error)
      set({ matchmakingStatus: 'idle' })
      return
    }
    
    set({ activeRoom: room })
    
    const roomSub = supabase
      .channel(`room_wait_${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`
      }, async (payload) => {
        if (payload.new.status === 'ready' && payload.new.player_2_id) {
          set({
            activeRoom: payload.new,
            matchmakingStatus: 'playing',
            multiplayerMode: 'online',
            multiplayer: true
          })
          supabase.removeChannel(roomSub)
          get().startGame()
        }
      })
      .subscribe()
      
    window.privateRoomSubscription = roomSub
  },
  
  joinPrivateRoom: async (roomId) => {
    const user = get().user
    if (!user) return false
    
    const upperId = roomId.trim().toUpperCase()
    
    if (!isSupabaseConfigured) {
      // Simulación offline
      set({
        activeRoom: { id: upperId, host_id: 'host', player_2_id: user.id, status: 'ready', map_seed: 1234, player_count: 2 },
        isHost: false,
        matchmakingStatus: 'playing',
        multiplayerMode: 'online',
        multiplayer: true
      })
      get().startGame()
      return true
    }
    
    const { data: room, error } = await supabase
      .from('rooms')
      .select()
      .eq('id', upperId)
      .single()
      
    if (error || !room || room.status !== 'waiting') {
      console.error("Room not found or not waiting", error)
      return false
    }
    
    const { data: updatedRoom, error: updateErr } = await supabase
      .from('rooms')
      .update({
        player_2_id: user.id,
        status: 'ready',
        player_count: 2
      })
      .eq('id', upperId)
      .select()
      .single()
      
    if (updateErr || !updatedRoom) {
      console.error("Failed to join room", updateErr)
      return false
    }
    
    set({
      activeRoom: updatedRoom,
      isHost: false,
      matchmakingStatus: 'playing',
      multiplayerMode: 'online',
      multiplayer: true
    })
    
    get().startGame()
    return true
  },
  
  leaveRoom: async () => {
    const user = get().user
    const room = get().activeRoom
    
    set({
      multiplayerMode: 'none',
      multiplayer: false,
      activeRoom: null,
      isHost: false,
      matchmakingStatus: 'idle',
      remotePlayerState: null
    })
    
    if (window.matchmakingSubscription) {
      if (isSupabaseConfigured) supabase.removeChannel(window.matchmakingSubscription)
      window.matchmakingSubscription = null
    }
    if (window.privateRoomSubscription) {
      if (isSupabaseConfigured) supabase.removeChannel(window.privateRoomSubscription)
      window.privateRoomSubscription = null
    }
    if (window.roomGameChannel) {
      if (isSupabaseConfigured) supabase.removeChannel(window.roomGameChannel)
      window.roomGameChannel = null
    }
    if (window.dbRoomGameSubscription) {
      if (isSupabaseConfigured) supabase.removeChannel(window.dbRoomGameSubscription)
      window.dbRoomGameSubscription = null
    }
    
    if (user && isSupabaseConfigured) {
      try {
        await supabase.from('matchmaking_queue').delete().eq('player_id', user.id)
      } catch (e) {}
      
      if (room) {
        try {
          if (room.host_id === user.id) {
            await supabase.from('rooms').update({ status: 'closed' }).eq('id', room.id)
          } else if (room.player_2_id === user.id) {
            await supabase.from('rooms').update({ player_2_id: null, status: 'waiting', player_count: 1 }).eq('id', room.id)
          }
        } catch (e) {}
      }
    }
    
    get().exitToMenu()
  },

  initGameRoomChannel: () => {
    const activeRoom = get().activeRoom
    const user = get().user
    const multiplayerMode = get().multiplayerMode

    // Limpiar canales antiguos
    if (window.roomGameChannel) {
      if (isSupabaseConfigured) supabase.removeChannel(window.roomGameChannel)
      window.roomGameChannel = null
    }
    if (window.dbRoomGameSubscription) {
      if (isSupabaseConfigured) supabase.removeChannel(window.dbRoomGameSubscription)
      window.dbRoomGameSubscription = null
    }

    if (multiplayerMode !== 'online' || !activeRoom || !user || !isSupabaseConfigured) return

    // 1. Suscribirse a Broadcast y Presence del juego
    const roomChannel = supabase.channel(`game_room_${activeRoom.id}`, {
      config: {
        presence: {
          key: user.id,
        }
      }
    })

    roomChannel
      .on('broadcast', { event: 'player_state' }, ({ payload }) => {
        if (payload.userId !== user.id) {
          set({
            remotePlayerState: payload,
            lastPacketTimestamp: Date.now()
          })
        }
      })
      .on('presence', { event: 'leave', key: '*' }, ({ leftPresences }) => {
        const otherUserId = activeRoom.host_id === user.id ? activeRoom.player_2_id : activeRoom.host_id
        if (otherUserId && leftPresences.some(p => p.userId === otherUserId)) {
          get().handleOnlineDisconnect("El otro jugador abandonó la partida.")
        }
      })

    roomChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({
          userId: user.id,
          online_at: new Date().toISOString()
        })
        set({ lastPacketTimestamp: Date.now() })
      }
    })

    window.roomGameChannel = roomChannel

    // 2. Suscribirse a cambios en la fila de base de datos para cierre
    const dbRoomSub = supabase
      .channel(`db_room_game_${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${activeRoom.id}`
      }, (payload) => {
        if (payload.new.status === 'closed') {
          get().handleOnlineDisconnect("La sala fue cerrada por el anfitrión.")
        }
      })
      .subscribe()

    window.dbRoomGameSubscription = dbRoomSub
  },

  broadcastLocalState: (payload) => {
    if (window.roomGameChannel && isSupabaseConfigured) {
      window.roomGameChannel.send({
        type: 'broadcast',
        event: 'player_state',
        payload
      })
    }
  },

  handleOnlineDisconnect: (message = "El otro jugador se ha desconectado.") => {
    alert(message)
    get().leaveRoom()
  },

  checkSession: async () => {
    if (!isSupabaseConfigured) return
    set({ authLoading: true })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        set({ user: session.user })
        await get().fetchProfile(session.user.id)
        get().fetchHistory()
      }
    } catch (e) {
      console.error('Error checking session:', e)
    } finally {
      set({ authLoading: false })
    }
  },

  fetchProfile: async (userId) => {
    if (!isSupabaseConfigured) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (data) {
        set({ profile: data, highScore: Math.max(data.max_altitude, get().highScore) })
      } else {
        // Si no se encuentra perfil, lo creamos manualmente desde el cliente como respaldo
        const { data: { session } } = await supabase.auth.getSession()
        const defaultUsername = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || 'Escalador'
        
        console.log('Perfil no encontrado para el usuario. Creándolo desde el cliente...')
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            username: defaultUsername,
            max_altitude: 0
          })
          .select()
          .maybeSingle()
        
        if (newProfile) {
          set({ profile: newProfile, highScore: Math.max(0, get().highScore) })
        } else if (createError) {
          console.error('Error al autocrear perfil desde el cliente:', createError)
        }
      }
    } catch (e) {
      console.error('Excepción en fetchProfile:', e)
    }
  },

  login: async (email, password) => {
    if (!isSupabaseConfigured) throw new Error('El servicio de récords online no está configurado')
    set({ authLoading: true })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      set({ user: data.user })
      await get().fetchProfile(data.user.id)
      get().fetchHistory()
      set({ authModalOpen: false })
      return data.user
    } catch (e) {
      console.error('Login error:', e)
      throw e
    } finally {
      set({ authLoading: false })
    }
  },

  register: async (email, username, password) => {
    if (!isSupabaseConfigured) throw new Error('El servicio de récords online no está configurado')
    set({ authLoading: true })
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      })
      if (error) throw error
      
      if (data?.user) {
        // Esperamos un momento a ver si se creó el perfil (el trigger de la base de datos puede tardar unos ms)
        await new Promise(r => setTimeout(r, 800))
        
        // Validamos si se inició sesión automáticamente (confirmación de correo desactivada)
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          set({ user: session.user })
          await get().fetchProfile(session.user.id)
          get().fetchHistory()
          set({ authModalOpen: false })
        } else {
          // Requiere confirmación de correo
          return { emailConfirmationRequired: true }
        }
      }
      return data.user
    } catch (e) {
      console.error('Registration error:', e)
      throw e
    } finally {
      set({ authLoading: false })
    }
  },

  logout: async () => {
    if (!isSupabaseConfigured) return
    set({ authLoading: true })
    try {
      await supabase.auth.signOut()
      set({ 
        user: null, 
        profile: null, 
        history: [], 
        highScore: 0
      })
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      set({ authLoading: false })
    }
  },

  fetchLeaderboard: async () => {
    if (!isSupabaseConfigured) return
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, max_altitude, updated_at')
        .gt('max_altitude', 0)
        .order('max_altitude', { ascending: false })
        .limit(20)
      
      if (error) throw error
      set({ leaderboard: data || [] })
    } catch (e) {
      console.error('Error fetching leaderboard:', e)
    }
  },

  fetchHistory: async () => {
    const { user } = get()
    if (!isSupabaseConfigured || !user) return
    try {
      const { data, error } = await supabase
        .from('scores_history')
        .select('score, created_at')
        .eq('profile_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (error) throw error
      set({ history: data || [] })
    } catch (e) {
      console.error('Error fetching score history:', e)
    }
  },

  saveScoreToSupabase: async (score) => {
    const { user, profile } = get()
    if (!isSupabaseConfigured || !user) return
    set({ saveScoreStatus: 'saving' })
    try {
      // 1. Guardar en historial
      const { error: histError } = await supabase
        .from('scores_history')
        .insert({
          profile_id: user.id,
          score: score
        })
      if (histError) throw histError

      // 2. Si supera récord de altitud, actualizar perfil
      const currentMax = profile?.max_altitude || 0
      if (score > currentMax) {
        const { error: profError } = await supabase
          .from('profiles')
          .update({
            max_altitude: score,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)
        
        if (profError) throw profError
        
        set((state) => ({
          profile: state.profile ? { ...state.profile, max_altitude: score } : null,
          highScore: score
        }))
      }

      // Actualizar el historial localmente
      get().fetchHistory()
      set({ saveScoreStatus: 'saved' })
    } catch (e) {
      console.error('Error saving score:', e)
      set({ saveScoreStatus: 'error' })
    }
  }
}))

export default useGameStore
