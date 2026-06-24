import { create } from 'zustand'

const useGameStore = create((set, get) => ({
  phase: 'ready',   // 'ready' | 'playing' | 'paused' | 'dead'
  score: 0,         // current score (= max height in meters)
  height: 0,        // current height (can decrease as player falls)
  highScore: 0,
  multiplayer: false,
  scenario: 'default', // 'default' | 'fog' | 'neon' | 'dark'
  isTransitioning: false,
  checkpointPos: [0, 2.5, 0],

  startGame: () => set({ phase: 'playing', score: 0, height: 0, checkpointPos: [0, 2.5, 0] }),

  gameOver: () => {
    const { score, highScore } = get()
    set({ phase: 'dead', highScore: Math.max(score, highScore) })
  },

  restart: () => set({ phase: 'playing', score: 0, height: 0, checkpointPos: [0, 2.5, 0] }),

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

  exitToMenu: () => set({ phase: 'ready', score: 0, height: 0, checkpointPos: [0, 2.5, 0] }),
}))

export default useGameStore
