import { useState } from 'react'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'
import { isSupabaseConfigured } from '../utils/supabaseClient'



/* ── Transition timing must match CSS .overlay--exit duration ─── */
const EXIT_MS = 680

export default function GameOverlay() {
  const phase           = useGameStore(s => s.phase)
  const score           = useGameStore(s => s.score)
  const highScore       = useGameStore(s => s.highScore)
  const multiplayer     = useGameStore(s => s.multiplayer)
  const scenario        = useGameStore(s => s.scenario)
  const isTransitioning = useGameStore(s => s.isTransitioning)
  const p1              = useGameStore(s => s.p1)
  const p2              = useGameStore(s => s.p2)

  const startGame       = useGameStore(s => s.startGame)
  const restart         = useGameStore(s => s.restart)
  const togglePause     = useGameStore(s => s.togglePause)
  const exitToMenu      = useGameStore(s => s.exitToMenu)
  const setScenario     = useGameStore(s => s.setScenario)

  // Online Multiplayer integrations
  const multiplayerMode      = useGameStore(s => s.multiplayerMode)
  const setMultiplayerMode   = useGameStore(s => s.setMultiplayerMode)
  const matchmakingStatus    = useGameStore(s => s.matchmakingStatus)
  const startMatchmaking     = useGameStore(s => s.startMatchmaking)
  const cancelMatchmaking    = useGameStore(s => s.cancelMatchmaking)
  const createPrivateRoom    = useGameStore(s => s.createPrivateRoom)
  const joinPrivateRoom      = useGameStore(s => s.joinPrivateRoom)
  const leaveRoom            = useGameStore(s => s.leaveRoom)
  const activeRoom           = useGameStore(s => s.activeRoom)
  const isHost               = useGameStore(s => s.isHost)
  const hasSavedRoom         = useGameStore(s => s.hasSavedRoom)
  const rejoinActiveRoom     = useGameStore(s => s.rejoinActiveRoom)

  // Supabase integrations
  const user                  = useGameStore(s => s.user)
  const profile               = useGameStore(s => s.profile)
  const setAuthModalOpen      = useGameStore(s => s.setAuthModalOpen)
  const setLeaderboardModalOpen = useGameStore(s => s.setLeaderboardModalOpen)
  const logout                = useGameStore(s => s.logout)
  const saveScoreStatus       = useGameStore(s => s.saveScoreStatus)

  const [exiting, setExiting] = useState(false)
  const [joiningCodeOpen, setJoiningCodeOpen] = useState(false)
  const [roomCodeInput, setRoomCodeInput] = useState('')

  const handleJoinByCode = async () => {
    if (!roomCodeInput.trim()) return
    audioSystem.playSFX('ui')
    const success = await joinPrivateRoom(roomCodeInput)
    if (!success) {
      alert("No se pudo encontrar la sala. Verifica el código e intenta nuevamente.")
    }
  }

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
          phase === 'paused' ? 'overlay-fixed overlay--paused' : 'overlay-bounded',
          phase === 'ready' ? 'overlay--ready' : phase === 'dead' ? 'overlay--dead' : '',
          exiting         ? 'overlay--exit'  : '',
        ].filter(Boolean).join(' ')}>

          {/* ── INITIAL SCREEN ────────────────────────────────────── */}
          {phase === 'ready' && (
            <div className="overlay-content" key="ready">

              {/* Profile status top bar */}
              <div className="profile-bar">
                {isSupabaseConfigured ? (
                  user ? (
                    <div className="profile-logged">
                      <span className="profile-user">👤 {profile?.username || user.email?.split('@')[0]}</span>
                      <span className="profile-record">🏆 Récord: <strong>{profile?.max_altitude || 0} m</strong></span>
                      <button className="btn-profile-action" onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); logout(); }}>Cerrar Sesión</button>
                    </div>
                  ) : (
                    <div className="profile-logged-out">
                      <button className="btn-profile-action btn-login" onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setAuthModalOpen(true); }}>🔑 Iniciar Sesión / Registro</button>
                    </div>
                  )
                ) : (
                  <div className="profile-offline">
                    <span>⚠️ Modo Invitado (Sin Conexión)</span>
                  </div>
                )}
                <button className="btn-leaderboard-open" onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setLeaderboardModalOpen(true); }}>🏆 Leaderboard</button>
              </div>

              <div className="logo-wrap">
                <span className="logo-eyebrow">ALTITUDE CHALLENGE</span>
                <h1 className="game-title">SCALADA</h1>
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
                    className={`selector-btn ${multiplayerMode === 'none' ? 'active' : ''}`}
                    onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setMultiplayerMode('none'); }}
                  >
                    👤 1 Jugador
                  </button>
                  <button 
                    className={`selector-btn ${multiplayerMode === 'local' ? 'active' : ''}`}
                    onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setMultiplayerMode('local'); }}
                  >
                    👥 2P Local
                  </button>
                  <button 
                    className={`selector-btn ${multiplayerMode === 'online' ? 'active' : ''}`}
                    onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setMultiplayerMode('online'); }}
                  >
                    🌐 2P Online
                  </button>
                </div>
              </div>

              {multiplayerMode !== 'online' && (
                <>
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

                      {multiplayerMode === 'local' && (
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
                </>
              )}

              {multiplayerMode === 'online' && (
                <div className="online-panel controls-card">
                  <p className="controls-card-title">MULTIJUGADOR ONLINE</p>
                  
                  {!user ? (
                    <div className="online-login-prompt" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px', gap: '10px' }}>
                      <p className="online-prompt-text" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.4', textAlign: 'center' }}>
                        Necesitas iniciar sesión para emparejarte en la nube, invitar amigos y guardar récords globales.
                      </p>
                      <button 
                        className="btn-play btn-login-online"
                        style={{ padding: '10px 16px', fontSize: '11px', width: '100%', maxWidth: '260px' }}
                        onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setAuthModalOpen(true); }}
                      >
                        🔑 INICIAR SESIÓN / REGISTRARSE
                      </button>
                    </div>
                  ) : (
                    <div className="online-actions-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', alignItems: 'center', padding: '10px 0' }}>
                      {matchmakingStatus === 'idle' && (
                        <>
                          {hasSavedRoom && (
                            <button 
                              className="btn-play btn-success online-btn"
                              style={{ 
                                width: '100%', 
                                maxWidth: '280px', 
                                padding: '12px', 
                                fontSize: '13px',
                                background: 'linear-gradient(135deg, #00ff87 0%, #60efff 100%)',
                                border: 'none',
                                color: '#050814',
                                fontWeight: 'bold',
                                marginBottom: '10px',
                                boxShadow: '0 0 15px rgba(0, 255, 135, 0.4)'
                              }}
                              onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); rejoinActiveRoom(); }}
                            >
                              🔄 RECONECTAR A PARTIDA ANTERIOR
                            </button>
                          )}

                          <button 
                            className="btn-play online-btn"
                            style={{ width: '100%', maxWidth: '280px', padding: '12px', fontSize: '13px' }}
                            onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); startMatchmaking(); }}
                          >
                            🔍 BUSCAR PARTIDA RÁPIDA
                          </button>
                          
                          <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '280px' }}>
                            <button 
                              className="btn-play btn-secondary online-sub-btn"
                              style={{ flex: 1, padding: '10px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.06)' }}
                              onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); createPrivateRoom(); }}
                            >
                              ✉️ CREAR SALA
                            </button>
                            <button 
                              className="btn-play btn-secondary online-sub-btn"
                              style={{ flex: 1, padding: '10px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.06)' }}
                              onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setJoiningCodeOpen(!joiningCodeOpen); }}
                            >
                              🔑 UNIRSE CON CÓDIGO
                            </button>
                          </div>
                          
                          {joiningCodeOpen && (
                            <div className="join-code-box" style={{ display: 'flex', gap: '8px', marginTop: '4px', width: '100%', maxWidth: '280px' }}>
                              <input 
                                type="text"
                                className="form-input join-input"
                                placeholder="CÓDIGO DE SALA"
                                maxLength={6}
                                value={roomCodeInput}
                                onChange={(e) => setRoomCodeInput(e.target.value)}
                                style={{ flex: 1, textTransform: 'uppercase', textAlign: 'center', fontFamily: 'Orbitron', letterSpacing: '2px', padding: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#fff' }}
                              />
                              <button 
                                className="btn-play btn-success"
                                style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #00d4ff 0%, #0099ff 100%)', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '8px' }}
                                onClick={handleJoinByCode}
                              >
                                IR
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      
                      {matchmakingStatus === 'searching' && (
                        <div className="searching-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                          <div className="ad-spinner" style={{ borderColor: 'rgba(0, 212, 255, 0.1)', borderTopColor: '#00ffff' }} />
                          
                          {isHost && activeRoom ? (
                            <>
                              <p className="searching-title" style={{ fontFamily: 'Orbitron', color: '#00ffff', fontSize: '12px', letterSpacing: '1px', margin: 0 }}>
                                SALA PRIVADA ABIERTA
                              </p>
                              <div className="glowing-code-box" style={{ background: 'rgba(0, 212, 255, 0.08)', border: '1px solid #00ffff', padding: '8px 20px', borderRadius: '12px', boxShadow: '0 0 15px rgba(0, 212, 255, 0.25)' }}>
                                <span style={{ fontFamily: 'Orbitron', fontSize: '24px', fontWeight: 'bold', letterSpacing: '4px', color: '#fff' }}>
                                  {activeRoom.id}
                                </span>
                              </div>
                              <p className="searching-hint" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', maxWidth: '240px', textAlign: 'center', margin: 0 }}>
                                Comparte este código con tu amigo. Esperando a que se conecte...
                              </p>
                              <button 
                                className="btn-play btn-danger"
                                style={{ padding: '8px 16px', fontSize: '12px', background: 'linear-gradient(135deg, #ff3366 0%, #ff0055 100%)', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 'bold' }}
                                onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); leaveRoom(); }}
                              >
                                🚪 CANCELAR Y SALIR
                              </button>
                            </>
                          ) : (
                            <>
                              <p className="searching-title" style={{ fontFamily: 'Orbitron', color: '#00ffff', fontSize: '13px', letterSpacing: '1px', margin: 0 }}>
                                BUSCANDO ESCALADOR...
                              </p>
                              <p className="searching-hint" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                                Buscando salas públicas disponibles en la nube.
                              </p>
                              <button 
                                className="btn-play btn-danger"
                                style={{ padding: '8px 16px', fontSize: '12px', background: 'linear-gradient(135deg, #ff3366 0%, #ff0055 100%)', border: 'none', color: '#fff', borderRadius: '8px', fontWeight: 'bold' }}
                                onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); cancelMatchmaking(); }}
                              >
                                ✕ CANCELAR BÚSQUEDA
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
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

              {multiplayer ? (
                <div className="multiplayer-results-block" style={{ margin: '15px 0', width: '100%', maxWidth: '300px' }}>
                  <p className="controls-card-title" style={{ color: '#00ffff', marginBottom: '12px', fontSize: '12px', letterSpacing: '1px' }}>CLASIFICACIÓN FINAL</p>
                  {(() => {
                    const playersResults = [
                      { id: 'p1', name: 'Jugador 1', score: p1.score, isLocal: multiplayerMode === 'local' || (multiplayerMode === 'online' && isHost), color: '#00ffff' },
                      { id: 'p2', name: 'Jugador 2', score: p2.score, isLocal: multiplayerMode === 'local' || (multiplayerMode === 'online' && !isHost), color: '#ff3366' }
                    ]
                    playersResults.sort((a, b) => b.score - a.score)
                    return playersResults.map((p, idx) => (
                      <div key={p.id} className="score-row" style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '10px 14px', 
                        background: 'rgba(255,255,255,0.05)', 
                        borderRadius: '8px',
                        marginBottom: '8px',
                        border: p.isLocal && multiplayerMode === 'online' ? '1px solid rgba(0,255,255,0.3)' : '1px solid transparent'
                      }}>
                        <span style={{ fontWeight: 'bold', color: p.color }}>
                          {idx === 0 ? '🏆 1º ' : '🥈 2º '} {p.name} {p.isLocal && multiplayerMode === 'online' && <span style={{ fontSize: '10px', opacity: 0.6 }}>(Tú)</span>}
                        </span>
                        <span className="score-num" style={{ fontSize: '20px', fontFamily: 'Orbitron', fontWeight: 'bold', color: '#fff' }}>{p.score} pts</span>
                      </div>
                    ))
                  })()}
                </div>
              ) : (
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
              )}

              {user && (
                <div className="supabase-save-status">
                  {saveScoreStatus === 'saving' && <span className="status-saving">💾 Guardando récord en la nube...</span>}
                  {saveScoreStatus === 'saved' && <span className="status-saved">✅ ¡Sincronizado en la nube!</span>}
                  {saveScoreStatus === 'error' && <span className="status-error">❌ Error al conectar con la nube</span>}
                </div>
              )}



              <div className="game-over-buttons-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '280px' }}>


                <button 
                  className="btn-play btn-secondary" 
                  onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); restart(); }}
                >
                  ↺&nbsp;&nbsp;REINTENTAR DESDE EL INICIO
                </button>
                
                <button 
                  className="btn-play btn-secondary" 
                  onClick={(e) => { e.currentTarget.blur(); audioSystem.playSFX('ui'); setLeaderboardModalOpen(true); }}
                >
                  🏆&nbsp;&nbsp;VER RÉCORDS
                </button>

                <button 
                  className="btn-play btn-danger" 
                  onClick={(e) => { 
                    e.currentTarget.blur(); 
                    audioSystem.playSFX('ui'); 
                    if (multiplayerMode === 'online') {
                      leaveRoom();
                    } else {
                      exitToMenu(); 
                    }
                  }}
                >
                  🚪&nbsp;&nbsp;SALIR AL MENÚ PRINCIPAL
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Screen fade transition overlay */}
      <div className={`fade-screen ${isTransitioning ? 'fade-screen--active' : ''}`} />

    </>
  )
}
