/**
 * Particle burst system for jump and landing effects.
 * Uses InstancedMesh for zero-overhead per-frame rendering —
 * no useState, no re-renders, pure imperative Three.js.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { dustQueue } from '../utils/gameEvents'
import * as THREE from 'three'

const MAX = 64

function spawnParticle(x, y, z, type) {
  const angle  = Math.random() * Math.PI * 2
  const isJump = type === 'jump'
  // Jump: burst upward; Land: scatter outward along ground
  const hSpeed = isJump ? (0.8 + Math.random() * 2.2) : (2.8 + Math.random() * 4.5)
  const vSpeed = isJump ? (3   + Math.random() * 5.5) : (0.3 + Math.random() * 1.2)

  return {
    x, y: y - 0.35, z,
    vx: Math.cos(angle) * hSpeed * (isJump ? 0.45 : 1),
    vy: vSpeed,
    vz: Math.sin(angle) * hSpeed * (isJump ? 0.45 : 1),
    life: 1.0,
    scale: isJump
      ? 0.06 + Math.random() * 0.09
      : 0.08 + Math.random() * 0.13,
  }
}

export default function JumpDust() {
  const meshRef    = useRef()
  const particles  = useRef([])
  const dummy      = useRef(new THREE.Object3D())

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    // Consume event queue
    while (dustQueue.length > 0) {
      const ev   = dustQueue.shift()
      const n    = ev.type === 'jump' ? 10 : 15
      for (let i = 0; i < n && particles.current.length < MAX; i++) {
        particles.current.push(spawnParticle(ev.x, ev.y, ev.z, ev.type))
      }
    }

    // Simulate + render
    const alive = []
    const d = dummy.current
    let idx = 0

    for (const p of particles.current) {
      p.life -= delta * 2.6
      if (p.life <= 0) continue
      alive.push(p)

      p.x  += p.vx * delta
      p.y  += p.vy * delta
      p.z  += p.vz * delta
      p.vy -= 18 * delta          // gravity

      const s = p.scale * p.life  // shrink to nothing as life → 0
      d.position.set(p.x, p.y, p.z)
      d.scale.set(s, s, s)
      d.updateMatrix()
      mesh.setMatrixAt(idx++, d.matrix)
    }

    particles.current = alive

    // Zero-scale unused slots so they don't appear
    d.scale.set(0, 0, 0)
    d.position.set(0, -9999, 0)
    d.updateMatrix()
    for (let i = idx; i < MAX; i++) mesh.setMatrixAt(i, d.matrix)

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, MAX]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#a8d8f0"
        emissive="#44aaff"
        emissiveIntensity={2.5}
        roughness={0.15}
        metalness={0.1}
      />
    </instancedMesh>
  )
}
