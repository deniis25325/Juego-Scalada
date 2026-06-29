import { useState, useRef, useEffect } from 'react'
import useGameStore from '../store/useGameStore'

export default function VirtualJoystick() {
  const setJoystick = useGameStore(s => s.setJoystick)
  const phase = useGameStore(s => s.phase)
  const isPlaying = phase === 'playing'

  const containerRef = useRef(null)
  const handleRef = useRef(null)

  const [active, setActive] = useState(false)
  const touchIdRef = useRef(null)
  const startPosRef = useRef({ x: 0, y: 0 })

  const MAX_RADIUS = 40 // Pixeles máximos que se puede desplazar la perilla desde el centro

  // Reiniciar el joystick si la fase del juego cambia
  useEffect(() => {
    if (!isPlaying) {
      setJoystick(0, 0)
      setActive(false)
      if (handleRef.current) {
        handleRef.current.style.transform = 'translate3d(0px, 0px, 0px)'
      }
    }
  }, [isPlaying, setJoystick])

  if (!isPlaying) return null

  const handlePointerDown = (e) => {
    e.preventDefault()
    if (active) return // Solo procesamos un toque principal

    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    setActive(true)
    touchIdRef.current = e.pointerId
    containerRef.current.setPointerCapture(e.pointerId)

    startPosRef.current = { x: centerX, y: centerY }
    updateJoystickPosition(e.clientX, e.clientY)
  }

  const handlePointerMove = (e) => {
    if (!active || e.pointerId !== touchIdRef.current) return
    e.preventDefault()
    updateJoystickPosition(e.clientX, e.clientY)
  }

  const handlePointerUp = (e) => {
    if (e.pointerId !== touchIdRef.current) return
    e.preventDefault()
    setActive(false)
    touchIdRef.current = null
    setJoystick(0, 0)
    if (handleRef.current) {
      handleRef.current.style.transform = 'translate3d(0px, 0px, 0px)'
    }
  }

  const updateJoystickPosition = (clientX, clientY) => {
    const dx = clientX - startPosRef.current.x
    const dy = clientY - startPosRef.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    let angle = Math.atan2(dy, dx)
    let moveX = dx
    let moveY = dy

    if (dist > MAX_RADIUS) {
      moveX = Math.cos(angle) * MAX_RADIUS
      moveY = Math.sin(angle) * MAX_RADIUS
    }

    if (handleRef.current) {
      handleRef.current.style.transform = `translate3d(${moveX}px, ${moveY}px, 0px)`
    }

    // Normalizar a valores entre -1 y 1
    const normX = moveX / MAX_RADIUS
    const normY = moveY / MAX_RADIUS

    setJoystick(normX, normY)
  }

  return (
    <div 
      className={`joystick-container ${active ? 'active' : ''}`}
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="joystick-base">
        <div className="joystick-handle" ref={handleRef} />
      </div>
    </div>
  )
}
