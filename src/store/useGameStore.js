import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../utils/supabaseClient'

let isProcessingMatch = false

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
  hasSavedRoom: false,
  playerStatus: 'ACTIVE', // 'ACTIVE' | 'AFK'
  p1Score: 0,
  p1Height: 0,
  p2Score: 0,
  p2Height: 0,

  startGame: () => {
    set((state) => ({ 
      phase: 'playing', 
      score: 0, 
      height: 0, 
      p1Score: 0,
      p1Height: 0,
      p2Score: 0,
      p2Height: 0,
      checkpointPos: [0, -0.25, 0], 
      levelVersion: state.levelVersion + 1, 
      saveScoreStatus: 'idle', 
      reviveCount: 0 
    }));
    get().initGameRoomChannel();
  },

  gameOver: () => {
    const { score, highScore, user, saveScoreToSupabase, multiplayerMode } = get()
    set({ phase: 'dead', highScore: Math.max(score, highScore) })
    if (user) {
      saveScoreToSupabase(score)
    }
    
    // Si estamos en modo online, notificar al otro jugador de que la partida terminó
    if (multiplayerMode === 'online') {
      get().broadcastGameOver()
    }
  },

  gameOverLocally: () => {
    if (get().phase === 'dead') return // Evitar bucles infinitos
    const { score, highScore, user, saveScoreToSupabase } = get()
    set({ phase: 'dead', highScore: Math.max(score, highScore) })
    if (user) {
      saveScoreToSupabase(score)
    }
  },

  broadcastGameOver: () => {
    if (window.roomGameChannel && isSupabaseConfigured) {
      window.roomGameChannel.send({
        type: 'broadcast',
        event: 'game_over',
        payload: {}
      })
    }
  },

  restart: () => {
    set((state) => ({ 
      phase: 'playing', 
      score: 0, 
      height: 0, 
      checkpointPos: [0, -0.25, 0], 
      levelVersion: state.levelVersion + 1, 
      saveScoreStatus: 'idle', 
      reviveCount: 0 
    }))
    if (get().multiplayerMode === 'online') {
      get().broadcastRestart()
    }
  },

  restartLocally: () => {
    set((state) => ({ 
      phase: 'playing', 
      score: 0, 
      height: 0, 
      checkpointPos: [0, -0.25, 0], 
      levelVersion: state.levelVersion + 1, 
      saveScoreStatus: 'idle', 
      reviveCount: 0 
    }))
  },

  broadcastRestart: () => {
    if (window.roomGameChannel && isSupabaseConfigured) {
      window.roomGameChannel.send({
        type: 'broadcast',
        event: 'game_restart',
        payload: {}
      })
    }
  },

  continueGame: () => {
    set((state) => ({ 
      phase: 'playing', 
      reviveCount: state.reviveCount + 1, 
      saveScoreStatus: 'idle' 
    }))
    if (get().multiplayerMode === 'online') {
      get().broadcastRevive()
    }
  },

  continueGameLocally: () => {
    set((state) => ({ 
      phase: 'playing', 
      reviveCount: state.reviveCount + 1, 
      saveScoreStatus: 'idle' 
    }))
  },

  broadcastRevive: () => {
    if (window.roomGameChannel && isSupabaseConfigured) {
      window.roomGameChannel.send({
        type: 'broadcast',
        event: 'game_revive',
        payload: {}
      })
    }
  },

  setHeight: (h) => {
    const rounded = Math.max(0, Math.floor(h))
    set((state) => ({
      height: rounded,
      score: Math.max(state.score, rounded),
    }))
  },

  setPlayer1Height: (h) => {
    const rounded = Math.max(0, Math.floor(h))
    set((state) => {
      const newP1Height = rounded
      const newP1Score = Math.max(state.p1Score, rounded)
      const maxH = Math.max(newP1Height, state.p2Height)
      const maxS = Math.max(newP1Score, state.p2Score)
      return {
        p1Height: newP1Height,
        p1Score: newP1Score,
        height: maxH,
        score: Math.max(state.score, maxS)
      }
    })
  },

  setPlayer2Height: (h) => {
    const rounded = Math.max(0, Math.floor(h))
    set((state) => {
      const newP2Height = rounded
      const newP2Score = Math.max(state.p2Score, rounded)
      const maxH = Math.max(state.p1Height, newP2Height)
      const maxS = Math.max(state.p1Score, newP2Score)
      return {
        p2Height: newP2Height,
        p2Score: newP2Score,
        height: maxH,
        score: Math.max(state.score, maxS)
      }
    })
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
    p1Score: 0,
    p1Height: 0,
    p2Score: 0,
    p2Height: 0,
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
  saveActiveRoomToLocalStorage: (room) => {
    const user = get().user
    if (!room || !user) return
    localStorage.setItem('scalada_active_room', JSON.stringify({
      roomId: room.id,
      playerId: user.id,
      mode: 'online',
      timestamp: Date.now(),
      host_id: room.host_id,
      player_2_id: room.player_2_id,
      map_seed: room.map_seed,
      player_count: room.player_count
    }))
    set({ hasSavedRoom: true })
  },

  checkSavedRoom: () => {
    const saved = localStorage.getItem('scalada_active_room')
    set({ hasSavedRoom: !!saved })
  },

  rejoinActiveRoom: async () => {
    const user = get().user
    if (!user) return false
    
    const saved = localStorage.getItem('scalada_active_room')
    if (!saved) return false
    
    try {
      const roomData = JSON.parse(saved)
      
      // Verificar si la sala existe en Supabase y no está cerrada
      if (isSupabaseConfigured) {
        const { data: remoteRoom, error } = await supabase
          .from('rooms')
          .select()
          .eq('id', roomData.roomId)
          .single()
          
        if (error || !remoteRoom || remoteRoom.status === 'closed') {
          // Si no existe o está cerrada, limpiar storage
          localStorage.removeItem('scalada_active_room')
          set({ hasSavedRoom: false })
          return false
        }
        
        // Restaurar estado de la sala activa
        set({
          activeRoom: remoteRoom,
          isHost: remoteRoom.host_id === user.id,
          matchmakingStatus: 'playing',
          multiplayerMode: 'online',
          multiplayer: true
        })
      } else {
        // En modo offline/simulación
        set({
          activeRoom: {
            id: roomData.roomId,
            host_id: roomData.host_id,
            player_2_id: roomData.player_2_id,
            status: 'ready',
            map_seed: roomData.map_seed,
            player_count: roomData.player_count
          },
          isHost: roomData.host_id === user.id,
          matchmakingStatus: 'playing',
          multiplayerMode: 'online',
          multiplayer: true
        })
      }
      
      get().startGame()
      return true
    } catch (e) {
      console.error("Error rejoining room:", e)
      localStorage.removeItem('scalada_active_room')
      set({ hasSavedRoom: false })
      return false
    }
  },

  startMatchmaking: async () => {
    const user = get().user
    if (!user) return
    
    set({ matchmakingStatus: 'searching' })
    isProcessingMatch = false
    
    if (window.matchmakingChannel) {
      if (isSupabaseConfigured) {
        supabase.removeChannel(window.matchmakingChannel)
      }
      window.matchmakingChannel = null
    }
    
    if (!isSupabaseConfigured) {
      // Modo local simulado de matchmaking si no hay credenciales
      setTimeout(() => {
        set({ matchmakingStatus: 'playing', multiplayerMode: 'online', multiplayer: true, isHost: true })
        get().startGame()
      }, 2000)
      return
    }
    
    // Crear canal de presencia y broadcast global para matchmaking
    const lobbyChannel = supabase.channel('global_matchmaking', {
      config: {
        presence: {
          key: user.id
        },
        broadcast: {
          self: true
        }
      }
    })
    
    lobbyChannel
      .on('presence', { event: 'sync' }, () => {
        const presences = lobbyChannel.presenceState()
        get().handlePresenceSync(presences)
      })
      .on('broadcast', { event: 'match_created' }, async ({ payload }) => {
        const currentUser = get().user
        if (!currentUser) return
        
        if (payload.hostId === currentUser.id || payload.player2Id === currentUser.id) {
          // Nos hemos emparejado, limpiar canal de matchmaking
          if (window.matchmakingChannel) {
            supabase.removeChannel(window.matchmakingChannel)
            window.matchmakingChannel = null
          }
          
          const activeRoomDetails = {
            id: payload.roomId,
            host_id: payload.hostId,
            player_2_id: payload.player2Id,
            status: 'ready',
            map_seed: payload.mapSeed,
            player_count: 2
          }
          
          set({
            activeRoom: activeRoomDetails,
            isHost: payload.hostId === currentUser.id,
            matchmakingStatus: 'playing',
            multiplayerMode: 'online',
            multiplayer: true
          })
          
          get().saveActiveRoomToLocalStorage(activeRoomDetails)
          get().startGame()
        }
      })
      
    lobbyChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await lobbyChannel.track({
          userId: user.id,
          username: get().profile?.username || user.email?.split('@')[0] || 'Escalador',
          status: 'searching',
          joinedAt: new Date().toISOString()
        })
      }
    })
    
    window.matchmakingChannel = lobbyChannel
  },

  handlePresenceSync: async (presences) => {
    const user = get().user
    if (!user) return
    
    // Obtener todos los escaladores en línea buscando partida
    const searchingPlayers = []
    Object.keys(presences).forEach((key) => {
      const tracks = presences[key]
      if (tracks && tracks.length > 0) {
        const p = tracks[0]
        if (p.status === 'searching' && p.userId !== user.id) {
          searchingPlayers.push(p)
        }
      }
    })
    
    if (searchingPlayers.length > 0) {
      // Ordenar por el que lleva más tiempo esperando (joinedAt más antiguo)
      searchingPlayers.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
      const opponent = searchingPlayers[0]
      
      // Decidir el iniciador de forma determinista para evitar duplicados (el de ID menor)
      const isInitiator = user.id < opponent.userId
      
      if (isInitiator) {
        if (isProcessingMatch) return
        isProcessingMatch = true
        
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
        const seed = Math.floor(Math.random() * 1000000)
        
        // Crear registro de sala en la base de datos de fondo
        if (isSupabaseConfigured) {
          supabase.from('rooms').insert({
            id: roomId,
            host_id: user.id,
            player_2_id: opponent.userId,
            status: 'ready',
            map_seed: seed,
            player_count: 2
          }).then(({ error }) => {
            if (error) console.error("Error creating database room record:", error)
          })
        }
        
        // Enviar broadcast de emparejamiento inmediato
        if (window.matchmakingChannel) {
          await window.matchmakingChannel.send({
            type: 'broadcast',
            event: 'match_created',
            payload: {
              hostId: user.id,
              player2Id: opponent.userId,
              roomId,
              mapSeed: seed
            }
          })
        }
      }
    }
  },
  
  cancelMatchmaking: async () => {
    const user = get().user
    set({ matchmakingStatus: 'idle' })
    isProcessingMatch = false
    
    if (window.matchmakingChannel) {
      if (isSupabaseConfigured) {
        supabase.removeChannel(window.matchmakingChannel)
      }
      window.matchmakingChannel = null
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
          get().saveActiveRoomToLocalStorage(payload.new)
          supabase.removeChannel(roomSub)
          get().startGame()
        }
      })
      .on('broadcast', { event: 'player_joined' }, async () => {
        // Fallback rápido si no llega postgres_changes por limitaciones de Realtime en DB
        const { data: latestRoom } = await supabase.from('rooms').select().eq('id', roomId).single()
        if (latestRoom && latestRoom.status === 'ready' && latestRoom.player_2_id) {
          set({
            activeRoom: latestRoom,
            matchmakingStatus: 'playing',
            multiplayerMode: 'online',
            multiplayer: true
          })
          get().saveActiveRoomToLocalStorage(latestRoom)
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
    
    get().saveActiveRoomToLocalStorage(updatedRoom)
    
    // Broadcast de entrada inmediata al anfitrión en el canal de espera
    const joinChannel = supabase.channel(`room_wait_${upperId}`)
    joinChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await joinChannel.send({
          type: 'broadcast',
          event: 'player_joined',
          payload: { userId: user.id }
        })
        supabase.removeChannel(joinChannel)
      }
    })
    
    get().startGame()
    return true
  },
  
  leaveRoom: async () => {
    const user = get().user
    const room = get().activeRoom
    
    localStorage.removeItem('scalada_active_room')
    set({
      multiplayerMode: 'none',
      multiplayer: false,
      activeRoom: null,
      isHost: false,
      matchmakingStatus: 'idle',
      remotePlayerState: null,
      hasSavedRoom: false
    })
    isProcessingMatch = false
    
    if (window.matchmakingChannel) {
      if (isSupabaseConfigured) supabase.removeChannel(window.matchmakingChannel)
      window.matchmakingChannel = null
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
          
          // Sincronizar altura y puntaje directamente desde el payload remoto
          if (payload.height !== undefined && payload.score !== undefined) {
            if (get().isHost) {
              set((state) => {
                const maxH = Math.max(state.p1Height, payload.height)
                const maxS = Math.max(state.p1Score, payload.score)
                return {
                  p2Height: payload.height,
                  p2Score: payload.score,
                  height: maxH,
                  score: Math.max(state.score, maxS)
                }
              })
            } else {
              set((state) => {
                const maxH = Math.max(payload.height, state.p2Height)
                const maxS = Math.max(payload.score, state.p2Score)
                return {
                  p1Height: payload.height,
                  p1Score: payload.score,
                  height: maxH,
                  score: Math.max(state.score, maxS)
                }
              })
            }
          }
        }
      })
      .on('broadcast', { event: 'game_over' }, () => {
        get().gameOverLocally()
      })
      .on('broadcast', { event: 'game_restart' }, () => {
        get().restartLocally()
      })
      .on('broadcast', { event: 'game_revive' }, () => {
        get().continueGameLocally()
      })
      .on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState()
        const otherUserId = activeRoom.host_id === user.id ? activeRoom.player_2_id : activeRoom.host_id
        
        let otherStatus = 'AFK'
        if (otherUserId && state[otherUserId]) {
          const tracks = state[otherUserId]
          if (tracks && tracks.length > 0) {
            otherStatus = tracks[0].status || 'ACTIVE'
          }
        }
        
        set({
          playerStatus: otherStatus
        })
      })

    roomChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({
          userId: user.id,
          online_at: new Date().toISOString(),
          status: 'ACTIVE'
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
    get().checkSavedRoom()
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
      localStorage.removeItem('scalada_active_room')
      set({ 
        user: null, 
        profile: null, 
        history: [], 
        highScore: 0,
        hasSavedRoom: false
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
