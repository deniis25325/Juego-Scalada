import { useState } from 'react'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

/* ── Transition timing must match CSS .overlay--exit duration ─── */
const EXIT_MS = 680

export default function GameOverlay() {
  const phase           = useGameStore(s => s.phase)
  const score           = useGameStore(s => s.score)
  const highScore       = useGameStore(s => s.highScore)
  const multiplayer     = useGameStore(s => s.multiplayer)
  const scenario        = useGameStore(s => s.scenario)
  const isTransitioning = useGameStore(s => s.isTransitioning)

  const startGame       = useGameStore(s => s.startGame)
  const restart         = useGameStore(s => s.restart)
  const togglePause     = useGameStore(s => s.togglePause)
  const exitToMenu      = useGameStore(s => s.exitToMenu)
  const setMultiplayer  = useGameStore(s => s.setMultiplayer)
  const setScenario     = useGameStore(s => s.setScenario)

  const [exiting, setExiting] = useState(false)

  const handlePlay = (e) => {
    if (e && e.currentTarget) e.currentTarget.blur()
    audioSystem.playSFX('ui')
    setExiting(true)
    setTimeout(() => {
      startGame()
      setExiting(false)
    }, EXIT_MS)
  }

  return (
    <>
      {phase !== 'playing' && (
        <div className={[
          'overlay',
          phase === 'ready' ? 'overlay--ready' : phase === 'paused' ? 'overlay--paused' : 'overlay--dead',
          exiting         ? 'overlay--exit'  : '',
        ].filter(Boolean).join(' ')}>

          {/* ── INITIAL SCREEN ────────────────────────────────────── */}
          {phase === 'ready' && (
            <div className="overlay-content" key="ready">

              {/* Title block */}
              <div className="logo-wrap">
                <span className="logo-eyebrow">ALTITUDE CHALLENGE</span>
                <h1 className="game-title">SKY<br />CLIMB</h1>
                <div className="title-glow" />
              </div>

              <p className="subtitle">
                Sube lo más alto que puedas antes de caer al vacío
              </p>

              {/* Game Mode Selector */}
              <div className="menu-section">
                <p className="menu-section-title">MODO DE JUEGO</p>
                <div className="selector-group">
                  <button 
                    className={`selector-btn ${!multiplayer ? 'active' : ''}`}
                    onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setMultiplayer(false); }}
                  >
                    👤 1 Jugador
                  </button>
                  <button 
                    className={`selector-btn ${multiplayer ? 'active' : ''}`}
                    onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setMultiplayer(true); }}
                  >
                    👥 2 Jugadores (Local)
                  </button>
                </div>
              </div>

              {/* Scenario Selector */}
              <div className="menu-section">
                <p className="menu-section-title">ESCENARIO</p>
                <div className="selector-grid">
                  {[
                    { id: 'default', label: 'Default', icon: '🌌' },
                    { id: 'fog', label: 'Niebla', icon: '🌫️' },
                    { id: 'neon', label: 'Neon Sci-Fi', icon: '🔮' },
                    { id: 'dark', label: 'Dark Mode', icon: '⚫' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      className={`selector-btn scenario-btn ${scenario === opt.id ? 'active' : ''}`}
                      onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setScenario(opt.id); }}
                    >
                      <span className="btn-icon">{opt.icon}</span>
                      <span className="btn-lbl">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Controls Info */}
              <div className="controls-card">
                <p className="controls-card-title">CONTROLES</p>

                <div className="controls-columns-wrap">
                  <div className="player-ctrl-col">
                    {multiplayer && <p className="player-title-hint">JUGADOR 1</p>}
                    <div className="controls-rows">
                      <div className="ctrl-item">
                        <div className="key-cluster">
                          <div className="key-row">
                            <span className="key-cap">W</span>
                          </div>
                          <div className="key-row">
                            <span className="key-cap">A</span>
                            <span className="key-cap">S</span>
                            <span className="key-cap">D</span>
                          </div>
                        </div>
                        <span className="ctrl-desc">Moverse</span>
                      </div>
                      <div className="ctrl-divider" />
                      <div className="ctrl-item">
                        <span className="key-cap key-space">ESPACIO</span>
                        <span className="ctrl-desc">Saltar</span>
                      </div>
                    </div>
                  </div>

                  {multiplayer && (
                    <>
                      <div className="col-divider" />
                      <div className="player-ctrl-col">
                        <p className="player-title-hint">JUGADOR 2</p>
                        <div className="controls-rows">
                          <div className="ctrl-item">
                            <div className="key-cluster">
                              <div className="key-row">
                                <span className="key-cap">▲</span>
                              </div>
                              <div className="key-row">
                                <span className="key-cap">◀</span>
                                <span className="key-cap">▼</span>
                                <span className="key-cap">▶</span>
                              </div>
                            </div>
                            <span className="ctrl-desc">Moverse</span>
                          </div>
                          <div className="ctrl-divider" />
                          <div className="ctrl-item">
                            <span className="key-cap key-enter">ENTER</span>
                            <span className="ctrl-desc">Saltar</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {highScore > 0 && (
                <p className="best-score">
                  Récord personal:&nbsp;<strong>{highScore} m</strong>
                </p>
              )}

              <button className="btn-play" onClick={handlePlay}>
                ▶&nbsp;&nbsp;JUGAR
              </button>
            </div>
          )}

          {/* ── PAUSE SCREEN ──────────────────────────────────────── */}
          {phase === 'paused' && (
            <div className="overlay-content pause-screen" key="paused">
              <h2 className="pause-title">JUEGO PAUSADO</h2>
              
              <p className="subtitle">
                Físicas y controles temporalmente suspendidos.
              </p>

              <div className="pause-menu-buttons">
                <button 
                  className="btn-play btn-pause-menu" 
                  onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); togglePause(); }}
                >
                  ▶&nbsp;&nbsp;CONTINUAR
                </button>
                
                <button 
                  className="btn-play btn-pause-menu btn-secondary" 
                  onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); restart(); }}
                >
                  ↺&nbsp;&nbsp;REINICIAR
                </button>

                <button 
                  className="btn-play btn-pause-menu btn-danger" 
                  onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); exitToMenu(); }}
                >
                  🚪&nbsp;&nbsp;SALIR AL MENÚ
                </button>
              </div>
            </div>
          )}

          {/* ── GAME OVER SCREEN ──────────────────────────────────── */}
          {phase === 'dead' && (
            <div className="overlay-content dead-screen" key="dead">
              <h2 className="game-over-title">GAME OVER</h2>

              <div className="score-block">
                <div className="score-row">
                  <span className="score-lbl">Puntuación</span>
                  <span className="score-num">{score}</span>
                </div>
                <div className="score-row">
                  <span className="score-lbl">Récord</span>
                  <span className="score-num record">{highScore}</span>
                </div>
              </div>

              <button 
                className="btn-play" 
                onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); restart(); }}
              >
                ↺&nbsp;&nbsp;REINTENTAR
              </button>
            </div>
          )}
        </div>
      )}

      {/* Screen fade transition overlay */}
      <div className={`fade-screen ${isTransitioning ? 'fade-screen--active' : ''}`} />
    </>
  )
}
