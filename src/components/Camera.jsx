import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { cameraShake } from '../utils/gameEvents'
import useGameStore from '../store/useGameStore'

const CAM_OFFSET  = new Vector3(0, 7, 11)
const LOOK_OFFSET = new Vector3(0, 1.5, 0)
const LERP_SPEED  = 6
const BASE_FOV    = 60
const SHAKE_DECAY = 7

// Cinematic starting position (snapped to this on game-start, then lerps to normal)
const INTRO_OFFSET = new Vector3(0, 28, 38)

const _targetPos  = new Vector3()
const _targetLook = new Vector3()
const _playerPos  = new Vector3()

export default function Camera({ player1PosRef, player2PosRef }) {
  const { camera } = useThree()
  const phase        = useGameStore(s => s.phase)
  const multiplayer  = useGameStore(s => s.multiplayer)
  const prevPhaseRef = useRef(null)
  const introTimer   = useRef(0)   // counts down; while > 0 = intro is playing
  const prevY        = useRef(0)

  useFrame((_, delta) => {
    const p1 = player1PosRef?.current
    const p2 = player2PosRef?.current

    if (!p1 || p1.x === undefined) return

    // Calculate focus center point
    let cx = p1.x
    let cy = p1.y
    let cz = p1.z
    let dist = 0

    if (multiplayer && p2 && p2.x !== undefined) {
      const p1DeadOrRespawning = window.player1Respawning || p1.y < -15
      const p2DeadOrRespawning = window.player2Respawning || p2.y < -15

      if (p1DeadOrRespawning && !p2DeadOrRespawning) {
        cx = p2.x
        cy = p2.y
        cz = p2.z
        dist = 0
      } else if (p2DeadOrRespawning && !p1DeadOrRespawning) {
        cx = p1.x
        cy = p1.y
        cz = p1.z
        dist = 0
      } else {
        cx = (p1.x + p2.x) / 2
        cy = (p1.y + p2.y) / 2
        cz = (p1.z + p2.z) / 2

        const dx = p1.x - p2.x
        const dy = p1.y - p2.y
        const dz = p1.z - p2.z
        dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      }
    }

    _playerPos.set(cx, cy, cz)

    // Dynamic zoom out when players separate
    const zoomZ = CAM_OFFSET.z + Math.min(10, dist * 0.45)
    const zoomY = CAM_OFFSET.y + Math.min(6, dist * 0.25)

    _targetPos.set(cx, cy + zoomY, cz + zoomZ)
    _targetLook.set(cx, cy + LOOK_OFFSET.y, cz)

    // ── Cinematic intro when game first starts ─────────────────────────
    if (phase === 'playing' && prevPhaseRef.current !== 'playing') {
      camera.position.set(cx, cy + INTRO_OFFSET.y, cz + INTRO_OFFSET.z)
      introTimer.current = 1.8
    }
    prevPhaseRef.current = phase

    // Use a faster lerp during the opening swoop (3× normal)
    const lerpFactor = introTimer.current > 0
      ? Math.min(1, LERP_SPEED * 3.0 * delta)
      : Math.min(1, LERP_SPEED * delta)

    if (introTimer.current > 0) introTimer.current -= delta

    // ── Smooth third-person follow ─────────────────────────────────────
    camera.position.lerp(_targetPos, lerpFactor)
    camera.lookAt(_targetLook)

    // ── Camera shake (landing impact) ─────────────────────────────────
    const decay = Math.max(0, 1 - SHAKE_DECAY * delta)
    cameraShake.x *= decay
    cameraShake.y *= decay
    cameraShake.z *= decay
    camera.position.x += cameraShake.x
    camera.position.y += cameraShake.y
    camera.position.z += cameraShake.z

    // ── Dynamic FOV — widens when rising fast ──────────────────────────
    const risingSpeed = Math.max(0, (cy - prevY.current) / Math.max(delta, 0.001))
    prevY.current = cy
    const targetFOV = BASE_FOV + risingSpeed * 0.55
    camera.fov += (targetFOV - camera.fov) * 3 * delta
    camera.updateProjectionMatrix()
  })

  return null
}
