import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import Platform from './Platform'
import { generateInitialPlatforms, generatePlatform, createRandom } from '../utils/platformGenerator'
import useGameStore from '../store/useGameStore'

const BUFFER_AHEAD = 45   // generate platforms up to this many units above player
const CULL_DIST    = -25  // remove platforms this many units below player

export default function PlatformManager({ player1PosRef, player2PosRef }) {
  const activeRoom                  = useGameStore(s => s.activeRoom)
  const seed                        = activeRoom?.map_seed ? parseInt(activeRoom.map_seed, 10) : null
  const [platforms, setPlatforms]   = useState(() => generateInitialPlatforms(35, seed))
  const topYRef                     = useRef(0)
  const lastCheckY                  = useRef(-Infinity)
  const phase                       = useGameStore(s => s.phase)
  const multiplayer                 = useGameStore(s => s.multiplayer)
  const levelVersion                = useGameStore(s => s.levelVersion)
  const prevVersionRef              = useRef(0)
  const rngRef                      = useRef(null)

  // ── Reset on new game ────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'playing') {
      // Only regenerate platforms if the level version changed (real start or reset)
      if (levelVersion !== prevVersionRef.current) {
        // Inicializar generador fresco con la semilla de red para sincronía determinista
        const freshRng = seed !== null ? createRandom(seed) : Math.random
        rngRef.current = freshRng

        const initial = generateInitialPlatforms(35, seed)
        setPlatforms(initial)
        topYRef.current   = initial[initial.length - 1].position[1]
        lastCheckY.current = -Infinity
        prevVersionRef.current = levelVersion
      }
    }
  }, [phase, levelVersion, seed])

  // ── Per-frame: generate ahead, cull behind ───────────────────────────
  useFrame(() => {
    if (phase !== 'playing' || !player1PosRef?.current) return

    // Calculate reference Ys for multijugador
    const y1 = player1PosRef.current.y
    const y2 = (multiplayer && player2PosRef?.current) ? player2PosRef.current.y : y1

    const maxPlayerY = Math.max(y1, y2)
    const minPlayerY = Math.min(y1, y2)

    // Only do work when the player has moved at least 1 unit
    if (Math.abs(maxPlayerY - lastCheckY.current) < 1) return
    lastCheckY.current = maxPlayerY

    setPlatforms(prev => {
      let changed = false
      let updated = prev

      // Cull platforms that are too far below the lowest player
      const filtered = updated.filter(p => p.position[1] > minPlayerY + CULL_DIST)
      if (filtered.length !== updated.length) {
        updated = filtered
        changed = true
      }

      // Generate new platforms above the highest player
      if (topYRef.current < maxPlayerY + BUFFER_AHEAD) {
        const added = []
        let last = updated[updated.length - 1]

        while (topYRef.current < maxPlayerY + BUFFER_AHEAD) {
          const newPlats = generatePlatform(
            last.position[1],
            last.position[0],
            last.position[2],
            last.position[1],
            rngRef.current || Math.random
          )
          added.push(...newPlats)
          last = newPlats[newPlats.length - 1]
          topYRef.current = last.position[1]
        }

        updated = [...updated, ...added]
        changed = true
      }

      return changed ? updated : prev
    })
  })

  return (
    <>
      {platforms.map(p => (
        <Platform
          key={p.id}
          {...p}
        />
      ))}
    </>
  )
}
