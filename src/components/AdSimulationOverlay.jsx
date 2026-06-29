import { useEffect, useState } from 'react'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

export default function AdSimulationOverlay({ isOpen, onClose }) {
  const continueGame = useGameStore(s => s.continueGame)
  const [timeLeft, setTimeLeft] = useState(30)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isOpen) return

    setTimeLeft(30)
    setProgress(0)

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressTimer)
          return 100
        }
        return prev + (100 / (30 * 10)) // 30 segundos en intervalos de 100ms
      })
    }, 100)

    return () => {
      clearInterval(timer)
      clearInterval(progressTimer)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleClaim = () => {
    audioSystem.playSFX('ui')
    continueGame()
    onClose()
  }

  return (
    <div className="ad-overlay">
      <div className="ad-card">
        <div className="ad-header">
          <span className="ad-badge">📺 ANUNCIO DE RECOMPENSA</span>
          <span className="ad-timer">
            {timeLeft > 0 ? `Cerrar en ${timeLeft}s` : '¡Recompensa lista!'}
          </span>
        </div>

        <div className="ad-video-container">
          <div className="ad-video-placeholder">
            <div className="ad-spinner" />
            <p className="ad-placeholder-text">Simulando reproducción de anuncio...</p>
            <p className="ad-sponsor-text">Sponsor: Sky Climb Premium App</p>
            <p className="ad-hint">Al finalizar, podrás continuar tu ascenso desde la última plataforma segura.</p>
          </div>
        </div>

        <div className="ad-progress-bar-wrap">
          <div className="ad-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="ad-buttons">
          <button 
            className={`btn-play ad-claim-btn ${timeLeft > 0 ? 'disabled' : ''}`}
            onClick={handleClaim}
            disabled={timeLeft > 0}
          >
            {timeLeft > 0 ? 'ESPERANDO ANUNCIO...' : '🎁 RECLAMAR Y CONTINUAR'}
          </button>
        </div>
      </div>
    </div>
  )
}
