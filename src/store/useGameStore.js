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

  startGame: () => set((state) => ({ phase: 'playing', score: 0, height: 0, checkpointPos: [0, -0.25, 0], levelVersion: state.levelVersion + 1, saveScoreStatus: 'idle', reviveCount: 0 })),

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

  setMultiplayer: (val) => set({ multiplayer: val }),
  setScenario: (val) => set({ scenario: val }),
  setTransitioning: (val) => set({ isTransitioning: val }),

  togglePause: () => set((state) => ({
    phase: state.phase === 'playing' ? 'paused' : state.phase === 'paused' ? 'playing' : state.phase
  })),

  setCheckpoint: (pos) => set({ checkpointPos: pos }),

  exitToMenu: () => set({ phase: 'ready', score: 0, height: 0, checkpointPos: [0, -0.25, 0], saveScoreStatus: 'idle' }),

  // Supabase Actions
  setAuthModalOpen: (val) => set({ authModalOpen: val }),
  setLeaderboardModalOpen: (val) => set({ leaderboardModalOpen: val }),
  setJoystick: (x, y) => set({ joystickX: x, joystickY: y }),
  setTouchJump: (val) => set({ touchJump: val }),

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
