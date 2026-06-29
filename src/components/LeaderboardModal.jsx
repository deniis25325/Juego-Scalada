import { useEffect, useState } from 'react'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'
import { isSupabaseConfigured } from '../utils/supabaseClient'

export default function LeaderboardModal() {
  const isOpen = useGameStore(s => s.leaderboardModalOpen)
  const setOpen = useGameStore(s => s.setLeaderboardModalOpen)
  const leaderboard = useGameStore(s => s.leaderboard)
  const history = useGameStore(s => s.history)
  const fetchLeaderboard = useGameStore(s => s.fetchLeaderboard)
  const fetchHistory = useGameStore(s => s.fetchHistory)
  const user = useGameStore(s => s.user)
  const profile = useGameStore(s => s.profile)

  const [activeTab, setActiveTab] = useState('global') // 'global' | 'personal'

  useEffect(() => {
    if (isOpen) {
      fetchLeaderboard()
      if (user) {
        fetchHistory()
      }
    }
  }, [isOpen, fetchLeaderboard, fetchHistory, user])

  if (!isOpen) return null

  const handleClose = () => {
    audioSystem.playSFX('ui')
    setOpen(false)
  }

  const handleTabChange = (tab) => {
    audioSystem.playSFX('ui')
    setActiveTab(tab)
  }

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  // Obtenemos el username de la metadata del usuario o del perfil
  const getUsername = () => {
    return profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Tú'
  }

  return (
    <div className="leaderboard-overlay" onClick={handleClose}>
      <div className="leaderboard-card" onClick={(e) => e.stopPropagation()}>
        <button className="leaderboard-close" onClick={handleClose}>×</button>

        <h2 className="leaderboard-title">RÉCORDS DE ALTITUD</h2>

        {!isSupabaseConfigured ? (
          <div className="leaderboard-warn">
            <p>La base de datos de récords en la nube no está configurada.</p>
            <p className="sub">Crea un archivo <code>.env</code> con las credenciales de conexión válidas para activar los récords online.</p>
          </div>
        ) : (
          <>
            <div className="leaderboard-tabs">
              <button 
                className={`tab-btn ${activeTab === 'global' ? 'active' : ''}`}
                onClick={() => handleTabChange('global')}
              >
                🌐 Global
              </button>
              <button 
                className={`tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
                onClick={() => handleTabChange('personal')}
              >
                👤 Historial Personal
              </button>
            </div>

            <div className="leaderboard-content">
              {activeTab === 'global' ? (
                <div className="leaderboard-table-wrap">
                  {leaderboard.length === 0 ? (
                    <p className="no-data">No hay registros de altitud o cargando...</p>
                  ) : (
                    <table className="leaderboard-table">
                      <thead>
                        <tr>
                          <th>Puesto</th>
                          <th>Jugador</th>
                          <th className="txt-right">Récord Altitud</th>
                          <th className="txt-right">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((row, index) => {
                          const isCurrentUser = profile && row.username === profile.username
                          return (
                            <tr key={index} className={isCurrentUser ? 'current-player-row' : ''}>
                              <td className="rank-col">
                                {index === 0 ? '🏆 1' : index === 1 ? '🥈 2' : index === 2 ? '🥉 3' : `${index + 1}`}
                              </td>
                              <td className="player-col">
                                {row.username} {isCurrentUser && <span className="you-badge">(tú)</span>}
                              </td>
                              <td className="score-col txt-right">{row.max_altitude} m</td>
                              <td className="date-col txt-right">{formatDate(row.updated_at)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="leaderboard-table-wrap">
                  {!user ? (
                    <div className="no-data-msg">
                      <p>Inicia sesión o regístrate para ver tu historial personal y registrar tus puntuaciones en el leaderboard global.</p>
                    </div>
                  ) : history.length === 0 ? (
                    <p className="no-data">Aún no has registrado ninguna partida. ¡Juega y sube lo más alto posible!</p>
                  ) : (
                    <div className="personal-summary-wrap">
                      <div className="personal-best-badge">
                        <span className="badge-lbl">Tu Mejor Récord</span>
                        <span className="badge-val">{profile?.max_altitude || 0} m</span>
                      </div>
                      
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th>Partida</th>
                            <th className="txt-right">Altitud Alcanzada</th>
                            <th className="txt-right">Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((row, index) => (
                            <tr key={index}>
                              <td>#{history.length - index}</td>
                              <td className="score-col txt-right highlight-text">{row.score} m</td>
                              <td className="date-col txt-right">{formatDate(row.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
