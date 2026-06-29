import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

export default function HUD() {
  const phase  = useGameStore(s => s.phase)
  const togglePause = useGameStore(s => s.togglePause)
  const playerStatus = useGameStore(s => s.playerStatus)
  const multiplayerMode = useGameStore(s => s.multiplayerMode)
  const isHost = useGameStore(s => s.isHost)

  // Single-player / Global scores
  const score  = useGameStore(s => s.score)
  const height = useGameStore(s => s.height)

  // Multiplayer individual scores
  const p1Score  = useGameStore(s => s.p1Score)
  const p1Height = useGameStore(s => s.p1Height)
  const p2Score  = useGameStore(s => s.p2Score)
  const p2Height = useGameStore(s => s.p2Height)

  if (phase !== 'playing') return null

  const isCoop = multiplayerMode === 'online' || multiplayerMode === 'local'

  return (
    <>
      <div className="hud">
        {!isCoop ? (
          <>
            <div className="hud-item">
              <span className="hud-label">ALTURA</span>
              <span className="hud-value">{height}<span className="hud-unit">m</span></span>
            </div>

            <div className="hud-divider" />

            <div className="hud-item">
              <span className="hud-label">PUNTOS</span>
              <span className="hud-value hud-score">{score}</span>
            </div>
          </>
        ) : (
          <div className="hud-coop-wrap" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div className="hud-coop-player p1-panel" style={{ opacity: isHost || multiplayerMode === 'local' ? 1 : 0.85 }}>
              <span className="hud-label" style={{ color: '#00ffff', fontWeight: 'bold' }}>JUGADOR 1 (P1)</span>
              <div style={{ display: 'flex', gap: '10px', fontSize: '14px', marginTop: '2px' }}>
                <span>Alt: <strong style={{ color: '#fff' }}>{p1Height}m</strong></span>
                <span>Pts: <strong className="hud-score" style={{ color: '#00ff87' }}>{p1Score}</strong></span>
              </div>
            </div>

            <div className="hud-divider" style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.15)' }} />

            <div className="hud-coop-player p2-panel" style={{ opacity: !isHost || multiplayerMode === 'local' ? 1 : 0.85 }}>
              <span className="hud-label" style={{ color: '#ff3366', fontWeight: 'bold' }}>JUGADOR 2 (P2)</span>
              <div style={{ display: 'flex', gap: '10px', fontSize: '14px', marginTop: '2px' }}>
                <span>Alt: <strong style={{ color: '#fff' }}>{p2Height}m</strong></span>
                <span>Pts: <strong className="hud-score" style={{ color: '#00ff87' }}>{p2Score}</strong></span>
              </div>
            </div>
          </div>
        )}
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
