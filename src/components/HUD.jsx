import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

export default function HUD() {
  const score  = useGameStore(s => s.score)
  const height = useGameStore(s => s.height)
  const phase  = useGameStore(s => s.phase)
  const togglePause = useGameStore(s => s.togglePause)
  const playerStatus = useGameStore(s => s.playerStatus)
  const multiplayerMode = useGameStore(s => s.multiplayerMode)

  if (phase !== 'playing') return null

  return (
    <>
      <div className="hud">
        <div className="hud-item">
          <span className="hud-label">ALTURA</span>
          <span className="hud-value">{height}<span className="hud-unit">m</span></span>
        </div>

        <div className="hud-divider" />

        <div className="hud-item">
          <span className="hud-label">PUNTOS</span>
          <span className="hud-value hud-score">{score}</span>
        </div>
      </div>

      {/* AFK Status Badge in Multiplayer */}
      {multiplayerMode === 'online' && playerStatus === 'AFK' && (
        <div className="afk-badge">
          ⚠️ COMPAÑERO DESCONECTADO / AFK
        </div>
      )}

      {/* pause trigger button */}
      <button 
        className="btn-pause-trigger" 
        onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); togglePause(); }}
        title="Pausar juego / Salir"
      >
        ⏸️
      </button>

      <div className="controls-hint">
        <span>WASD · Mover</span>
        <span className="hint-sep">|</span>
        <span>ESPACIO · Saltar</span>
      </div>
    </>
  )
}
