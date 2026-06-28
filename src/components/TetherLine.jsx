import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'

const _colorCian = new THREE.Color('#00f3ff')
const _colorAmarillo = new THREE.Color('#ffea00')
const _colorRojo = new THREE.Color('#ff003c')

export default function TetherLine({ p1Ref, p2Ref }) {
  const lineRef = useRef()

  useFrame((state) => {
    if (!lineRef.current || !p1Ref.current || !p2Ref.current) return

    const p1 = p1Ref.current
    const p2 = p2Ref.current

    if (lineRef.current.geometry?.setPositions) {
      lineRef.current.geometry.setPositions([
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z
      ])
      lineRef.current.computeLineDistances?.()
    }

    // Calculate real distance between players
    const dx = p1.x - p2.x
    const dy = p1.y - p2.y
    const dz = p1.z - p2.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (lineRef.current.material) {
      let targetColor = _colorCian
      let targetWidth = 2.0

      if (dist > 9.5) {
        // High tension: flashing bright red, thinner wire
        targetColor = _colorRojo
        targetWidth = 1.0 + Math.sin(state.clock.getElapsedTime() * 25) * 0.4
      } else if (dist > 6.0) {
        // Medium tension: yellow, standard thickness
        targetColor = _colorAmarillo
        targetWidth = 2.2
      } else {
        // Low tension: cyan, thick rope
        targetColor = _colorCian
        targetWidth = 3.2
      }

      lineRef.current.material.color.lerp(targetColor, 0.15)
      lineRef.current.material.linewidth = THREE.MathUtils.lerp(lineRef.current.material.linewidth || 2, targetWidth, 0.15)
    }
  })

  return (
    <Line
      ref={lineRef}
      points={[[0, 0, 0], [0, 0, 0]]}
      color="#00f3ff"
      lineWidth={3.2}
      toneMapped={false}
    />
  )
}
