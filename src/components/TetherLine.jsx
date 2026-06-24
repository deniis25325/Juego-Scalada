import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'

export default function TetherLine({ p1Ref, p2Ref }) {
  const lineRef = useRef()

  useFrame(() => {
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
  })

  return (
    <Line
      ref={lineRef}
      points={[[0, 0, 0], [0, 0, 0]]}
      color="#ff00ff"
      lineWidth={2.2}
      toneMapped={false}
    />
  )
}
