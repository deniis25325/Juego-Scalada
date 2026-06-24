import useGameStore from '../store/useGameStore'

export default function HUD() {
  const score  = useGameStore(s => s.score)
  const height = useGameStore(s => s.height)
  const phase  = useGameStore(s => s.phase)

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

      <div className="controls-hint">
        <span>WASD · Mover</span>
        <span className="hint-sep">|</span>
        <span>ESPACIO · Saltar</span>
      </div>
    </>
  )
}
