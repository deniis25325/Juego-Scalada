import { useState, useEffect } from 'react'
import useGameStore from '../store/useGameStore'

export default function JumpButton() {
  const setTouchJump = useGameStore(s => s.setTouchJump)
  const phase = useGameStore(s => s.phase)
  const isPlaying = phase === 'playing'
  const [pressed, setPressed] = useState(false)

  // Resetear el botón si la fase cambia
  useEffect(() => {
    if (!isPlaying) {
      setTouchJump(false)
      setPressed(false)
    }
  }, [isPlaying, setTouchJump])

  if (!isPlaying) return null

  const handlePointerDown = (e) => {
    e.preventDefault()
    setPressed(true)
    setTouchJump(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerUp = (e) => {
    e.preventDefault()
    setPressed(false)
    setTouchJump(false)
  }

  return (
    <div 
      className={`jump-button-container ${pressed ? 'pressed' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <button className="jump-btn-inner">
        ▲
      </button>
    </div>
  )
}
