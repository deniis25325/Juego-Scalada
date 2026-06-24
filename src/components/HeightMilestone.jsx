/**
 * CSS overlay notification that fires every 10 metres of new height.
 * Styled to slide in from the right and out again automatically.
 */
import { useState, useEffect, useRef } from 'react'
import useGameStore from '../store/useGameStore'

export default function HeightMilestone() {
  const score = useGameStore(s => s.score)
  const phase = useGameStore(s => s.phase)

  const [note, setNote]     = useState(null)   // { value, key }
  const lastShown           = useRef(0)
  const timerRef            = useRef()

  // Reset when a new game starts
  useEffect(() => {
    if (phase === 'playing') lastShown.current = 0
  }, [phase])

  // Trigger notification at every 10 m milestone
  useEffect(() => {
    if (phase !== 'playing') return

    const milestone = Math.floor(score / 10) * 10
    if (milestone < 10 || milestone <= lastShown.current) return

    lastShown.current = milestone
    clearTimeout(timerRef.current)
    // use milestone as key so React re-mounts → animation restarts
    setNote({ value: milestone, key: milestone })
    timerRef.current = setTimeout(() => setNote(null), 2200)
  }, [score, phase])

  if (!note) return null

  return (
    <div className="milestone" key={note.key}>
      <span className="milestone-icon">↑</span>
      <div className="milestone-text">
        <span className="milestone-height">
          {note.value}<small>m</small>
        </span>
        <span className="milestone-label">NUEVA MARCA</span>
      </div>
    </div>
  )
}
