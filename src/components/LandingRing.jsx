/**
 * Expanding teal ring that appears on player landing.
 * Driven fully imperatively (no useState) — zero re-renders.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ringQueue } from '../utils/gameEvents'

export default function LandingRing() {
  const meshRef  = useRef()
  const matRef   = useRef()
  const state    = useRef({ active: false, x: 0, y: 0, z: 0, t: 0 })

  useFrame((_, delta) => {
    // Consume latest ring event (one active ring at a time is enough)
    while (ringQueue.length > 0) {
      const ev = ringQueue.shift()
      state.current = { active: true, x: ev.x, y: ev.y - 0.13, z: ev.z, t: 0 }
    }

    const s = state.current
    if (!s.active || !meshRef.current) return

    s.t += delta * 3.2
    if (s.t >= 1) {
      s.active = false
      meshRef.current.scale.set(0, 0, 0)
      return
    }

    // Expand outward, fade out
    const scale   = 0.15 + s.t * 5
    const opacity = (1 - s.t) * 0.75

    meshRef.current.position.set(s.x, s.y, s.z)
    meshRef.current.scale.set(scale, 1, scale)
    if (matRef.current) matRef.current.opacity = opacity
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.7, 1, 48]} />
      <meshStandardMaterial
        ref={matRef}
        color="#00d4ff"
        emissive="#00d4ff"
        emissiveIntensity={3}
        transparent
        opacity={0.75}
        depthWrite={false}
      />
    </mesh>
  )
}
