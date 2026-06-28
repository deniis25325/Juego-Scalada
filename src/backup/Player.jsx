import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import { useKeyboardControls } from '@react-three/drei'
import { Vector3 } from 'three'
import useGameStore from '../store/useGameStore'
import { emitDust, emitRing, triggerShake } from '../utils/gameEvents'
import audioSystem from '../utils/audioSystem'

const SPEED    = 9
const JUMP_VEL = 13
const DEATH_Y  = -25
const DAMPING  = 8

// Reusable module-level vectors (no allocations per frame)
const _camDir  = new Vector3()
const _right   = new Vector3()
const _up      = new Vector3(0, 1, 0)
const _moveDir = new Vector3()

// Global positions and velocities for coordinate referencing in multiplayer coop respawns
window.player1Pos = { x: 0, y: 2.5, z: 0 }
window.player2Pos = { x: 0, y: 2.5, z: 0 }
window.player1Vel = { x: 0, y: 0, z: 0 }
window.player2Vel = { x: 0, y: 0, z: 0 }

export default function Player({ playerId = 1, playerPosRef }) {
  const rbRef          = useRef()
  const isGrounded     = useRef(false)
  const groundContacts = useRef(0)
  const wasGroundedRef = useRef(false)  // landing detection
  const wasJumpRef     = useRef(false)  // prevent hold-to-jump
  const coyoteRef      = useRef(0)      // grace window after leaving platform

  // Visual refs — physics body is NOT scaled/rotated
  const squashGroupRef = useRef()   // squash & stretch scale
  const meshRef        = useRef()   // direction rotation + lean
  const jetpackMatRef  = useRef()   // jetpack emissive animation

  // Roblox humanoid limb refs
  const walkTimeRef    = useRef(0)
  const torsoRef       = useRef()
  const headRef        = useRef()
  const leftArmRef     = useRef()
  const rightArmRef    = useRef()
  const leftLegRef     = useRef()
  const rightLegRef    = useRef()

  const phase           = useGameStore(s => s.phase)
  const multiplayer     = useGameStore(s => s.multiplayer)
  const isTransitioning = useGameStore(s => s.isTransitioning)
  const gameOver        = useGameStore(s => s.gameOver)
  const setHeight       = useGameStore(s => s.setHeight)

  // Reset physics on new game / retry
  useEffect(() => {
    if (phase === 'playing' && rbRef.current) {
      const checkpointPos = useGameStore.getState().checkpointPos
      const spawnX = playerId === 1 ? -1 : 1

      // Spawn at checkpoint if active, else spawn at starting base
      const hasCheckpoint = checkpointPos[1] > 3.0
      const sx = hasCheckpoint ? checkpointPos[0] + (multiplayer ? spawnX : 0) : (multiplayer ? spawnX : 0)
      const sy = hasCheckpoint ? checkpointPos[1] : 2.5
      const sz = hasCheckpoint ? checkpointPos[2] : 0

      rbRef.current.setTranslation({ x: sx, y: sy, z: sz }, true)
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }, [phase, multiplayer])

  const [, getKeys] = useKeyboardControls()

  useFrame((state, delta) => {
    if (!rbRef.current || phase === 'ready' || phase === 'dead') return

    // ── Pause State Handling ──────────────────────────────────────────
    if (phase === 'paused') {
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
      return
    }

    // ── Player-specific input controls ───────────────────────────────
    const keys = getKeys()
    const forward   = playerId === 1 ? keys.p1_forward   : keys.p2_forward
    const backward  = playerId === 1 ? keys.p1_backward  : keys.p2_backward
    const leftward  = playerId === 1 ? keys.p1_leftward  : keys.p2_leftward
    const rightward = playerId === 1 ? keys.p1_rightward : keys.p2_rightward
    const jump      = playerId === 1 ? keys.p1_jump      : keys.p2_jump

    const translation = rbRef.current.translation()
    const linvel      = rbRef.current.linvel()

    // Save positions to window for coop coordinate checks
    if (playerId === 1) {
      window.player1Pos = { x: translation.x, y: translation.y, z: translation.z }
    } else {
      window.player2Pos = { x: translation.x, y: translation.y, z: translation.z }
    }

    // ── Safe Fall & Respawn (Bug Fix) ──────────────────────────────────
    if (translation.y < DEATH_Y && !isTransitioning) {
      useGameStore.setState({ isTransitioning: true })
      audioSystem.playSFX('fall')

      // Freeze all movement immediately
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)

      const checkpointPos = useGameStore.getState().checkpointPos

      let respawnX = checkpointPos[0]
      let respawnY = checkpointPos[1]
      let respawnZ = checkpointPos[2]
      let isCoopRespawn = false

      if (multiplayer) {
        const otherPos = playerId === 1 ? window.player2Pos : window.player1Pos
        // If buddy is still alive, respawn on top of them!
        if (otherPos && otherPos.y > DEATH_Y) {
          respawnX = otherPos.x
          respawnY = otherPos.y + 2.0
          respawnZ = otherPos.z
          isCoopRespawn = true
        }
      }

      rbRef.current.setTranslation({ x: respawnX, y: respawnY, z: respawnZ }, true)

      setTimeout(() => {
        if (multiplayer && isCoopRespawn) {
          useGameStore.setState({ isTransitioning: false })
        } else {
          // If single player or both fell, trigger game over (will respawn at checkpoint on retry)
          gameOver()
          useGameStore.setState({ isTransitioning: false })
        }
      }, 600)
      return
    }

    // ── Coyote time ────────────────────────────────────────────────────
    if (isGrounded.current) {
      coyoteRef.current = 0.14
    } else {
      coyoteRef.current = Math.max(0, coyoteRef.current - delta)
    }

    // ── Camera-relative movement direction ─────────────────────────────
    state.camera.getWorldDirection(_camDir)
    _camDir.y = 0
    _camDir.normalize()
    _right.crossVectors(_camDir, _up).normalize()

    _moveDir.set(0, 0, 0)
    if (forward)   _moveDir.add(_camDir)
    if (backward)  _moveDir.sub(_camDir)
    if (rightward) _moveDir.add(_right)
    if (leftward)  _moveDir.sub(_right)

    const hasInput = _moveDir.lengthSq() > 0.001
    if (hasInput) _moveDir.normalize()

    // ── Horizontal velocity ─────────────────────────────────────────────
    let vx = hasInput
      ? _moveDir.x * SPEED
      : linvel.x * Math.max(0, 1 - DAMPING * delta)
    let vz = hasInput
      ? _moveDir.z * SPEED
      : linvel.z * Math.max(0, 1 - DAMPING * delta)

    let vy = linvel.y

    // ── Multiplayer Tether (elastic chain + rigid limit mechanical force) ──
    if (multiplayer && phase === 'playing') {
      const otherPos = playerId === 1 ? window.player2Pos : window.player1Pos
      if (otherPos && otherPos.y > DEATH_Y) {
        const dx = translation.x - otherPos.x
        const dy = translation.y - otherPos.y
        const dz = translation.z - otherPos.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const TETHER_MAX = 10.5

        if (dist > TETHER_MAX) {
          const ux = dx / dist
          const uy = dy / dist
          const uz = dz / dist

          // 1. Elastic pull force (accelerates attraction)
          const pullStrength = (dist - TETHER_MAX) * 4.0
          vx -= ux * pullStrength
          vy -= uy * pullStrength
          vz -= uz * pullStrength

          // 2. Rigid velocity limit constraint (prevent further separation)
          const otherVel = playerId === 1 ? window.player2Vel : window.player1Vel
          if (otherVel) {
            const relVx = vx - otherVel.x
            const relVy = vy - otherVel.y
            const relVz = vz - otherVel.z
            const relVDotU = relVx * ux + relVy * uy + relVz * uz

            // If moving apart, cancel the outward relative velocity component
            if (relVDotU > 0) {
              vx -= relVDotU * ux
              vy -= relVDotU * uy
              vz -= relVDotU * uz
            }
          }
        }
      }
    }

    // ── Fast fall (snappier arc) ────────────────────────────────────────
    if (vy < -1.5) {
      vy = Math.max(vy * (1 + 2.8 * delta), -42)
    }

    // ── Jump ────────────────────────────────────────────────────────────
    const canJump = isGrounded.current || coyoteRef.current > 0
    if (jump && !wasJumpRef.current && canJump) {
      vy = JUMP_VEL
      coyoteRef.current = 0

      // Vertical stretch on takeoff
      if (squashGroupRef.current) {
        squashGroupRef.current.scale.set(0.70, 1.42, 0.70)
      }
      emitDust(translation.x, translation.y, translation.z, 'jump')
      audioSystem.playSFX('jump')
      wasJumpRef.current = true
    }
    if (!jump) wasJumpRef.current = false

    rbRef.current.setLinvel({ x: vx, y: vy, z: vz }, true)

    // Save velocities to window for coop physics
    if (playerId === 1) {
      window.player1Vel = { x: vx, y: vy, z: vz }
    } else {
      window.player2Vel = { x: vx, y: vy, z: vz }
    }

    // ── Landing detection ───────────────────────────────────────────────
    if (isGrounded.current && !wasGroundedRef.current) {
      const impact = Math.min(Math.abs(linvel.y) / JUMP_VEL, 1)
      if (squashGroupRef.current && impact > 0.08) {
        squashGroupRef.current.scale.set(
          1 + impact * 0.48,
          Math.max(0.55, 1 - impact * 0.42),
          1 + impact * 0.48,
        )
      }
      emitDust(translation.x, translation.y, translation.z, 'land')
      emitRing(translation.x, translation.y, translation.z)
      audioSystem.playSFX('land')
      if (impact > 0.2) triggerShake(impact * 0.3)
    }
    wasGroundedRef.current = isGrounded.current

    // ── Squash/stretch lerp back to identity ────────────────────────────
    if (squashGroupRef.current) {
      const sc  = squashGroupRef.current.scale
      const spd = Math.min(1, 11 * delta)
      sc.x += (1 - sc.x) * spd
      sc.y += (1 - sc.y) * spd
      sc.z += (1 - sc.z) * spd
    }

    const runSpeed = Math.sqrt(vx * vx + vz * vz)

    // ── Character visual: direction rotation + forward lean ─────────────
    if (meshRef.current) {
      if (hasInput) {
        meshRef.current.rotation.y = Math.atan2(_moveDir.x, _moveDir.z)
      }
      const targetLean = hasInput ? -runSpeed * 0.024 : 0
      meshRef.current.rotation.x +=
        (targetLean - meshRef.current.rotation.x) * 9 * delta
    }

    // ── Jetpack glow intensifies when airborne ──────────────────────────
    if (jetpackMatRef.current) {
      const targetEmissive = isGrounded.current ? 0.5 : 3.2
      jetpackMatRef.current.emissiveIntensity +=
        (targetEmissive - jetpackMatRef.current.emissiveIntensity) * 5 * delta
    }

    // ── Roblox walk/jump animation logic ────────────────────────────────
    if (isGrounded.current && runSpeed > 0.2) {
      walkTimeRef.current = (walkTimeRef.current || 0) + delta * runSpeed * 1.6
    } else if (isGrounded.current) {
      if (walkTimeRef.current !== undefined) {
        walkTimeRef.current = walkTimeRef.current * Math.max(0, 1 - 10 * delta)
      }
    }

    // Target rotations/positions for limbs
    let targetLeftLegX = 0
    let targetRightLegX = 0
    let targetLeftArmX = 0
    let targetRightArmX = 0
    let targetLeftArmZ = 0.1
    let targetRightArmZ = -0.1
    let targetHeadX = 0
    let torsoBob = 0

    if (!isGrounded.current) {
      if (vy > 1) {
        targetLeftArmZ = 1.1
        targetRightArmZ = -1.1
        targetLeftArmX = -0.3
        targetRightArmX = -0.3
        targetLeftLegX = 0.25
        targetRightLegX = -0.25
      } else {
        targetLeftArmZ = 0.9 + Math.sin(state.clock.getElapsedTime() * 15) * 0.15
        targetRightArmZ = -0.9 - Math.sin(state.clock.getElapsedTime() * 15) * 0.15
        targetLeftArmX = 0.4
        targetRightArmX = 0.4
        targetLeftLegX = -0.3
        targetRightLegX = 0.15
      }
    } else if (runSpeed > 0.2) {
      const cycle = walkTimeRef.current || 0
      const swing = Math.sin(cycle) * 0.75
      targetLeftLegX = swing
      targetRightLegX = -swing
      targetLeftArmX = -swing
      targetRightArmX = swing
      targetLeftArmZ = 0.15
      targetRightArmZ = -0.15
      torsoBob = Math.abs(Math.sin(cycle * 2)) * 0.06
    } else {
      const time = state.clock.getElapsedTime()
      const breathe = Math.sin(time * 2.2)
      targetLeftArmZ = 0.08 + breathe * 0.03
      targetRightArmZ = -0.08 - breathe * 0.03
      targetLeftArmX = breathe * 0.02
      targetRightArmX = -breathe * 0.02
      torsoBob = breathe * 0.015
    }

    const lerpSpeed = 14
    if (leftLegRef.current) leftLegRef.current.rotation.x += (targetLeftLegX - leftLegRef.current.rotation.x) * lerpSpeed * delta
    if (rightLegRef.current) rightLegRef.current.rotation.x += (targetRightLegX - rightLegRef.current.rotation.x) * lerpSpeed * delta
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x += (targetLeftArmX - leftArmRef.current.rotation.x) * lerpSpeed * delta
      leftArmRef.current.rotation.z += (targetLeftArmZ - leftArmRef.current.rotation.z) * lerpSpeed * delta
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x += (targetRightArmX - rightArmRef.current.rotation.x) * lerpSpeed * delta
      rightArmRef.current.rotation.z += (targetRightArmZ - rightArmRef.current.rotation.z) * lerpSpeed * delta
    }
    if (headRef.current) {
      if (!isGrounded.current) {
        targetHeadX = vy > 0 ? -0.15 : 0.15
      } else if (runSpeed > 0.2) {
        targetHeadX = 0.08
      }
      headRef.current.rotation.x += (targetHeadX - headRef.current.rotation.x) * lerpSpeed * delta
      const idleHeadBob = (isGrounded.current && runSpeed <= 0.2) ? Math.sin(state.clock.getElapsedTime() * 2.2) * 0.008 : 0
      headRef.current.position.y += ((0.45 + idleHeadBob) - headRef.current.position.y) * lerpSpeed * delta
    }
    if (torsoRef.current) {
      torsoRef.current.position.y += ((0.0 + torsoBob) - torsoRef.current.position.y) * lerpSpeed * delta
    }

    // ── Shared position ref ───────────────────────────────────────────
    if (playerPosRef) {
      playerPosRef.current.x = translation.x
      playerPosRef.current.y = translation.y
      playerPosRef.current.z = translation.z
    }

    // Only Player 1 drives height score tracking
    if (playerId === 1) {
      setHeight(translation.y - 2.5)
    }
  })

  const handleCollisionEnter = () => {
    groundContacts.current++
    isGrounded.current = true
  }
  const handleCollisionExit = () => {
    groundContacts.current = Math.max(0, groundContacts.current - 1)
    if (groundContacts.current === 0) isGrounded.current = false
  }

  // Neon style overrides for Player 2
  const pColorTorso = playerId === 1 ? "#2a2a35" : "#1a2f26"
  const pColorAccent = playerId === 1 ? "#00ffff" : "#ff007f"
  const pColorBoots = playerId === 1 ? "#ff007f" : "#39ff14"
  const pColorArm = playerId === 1 ? "#2a2a35" : "#1a2f26"
  const pColorLeg = playerId === 1 ? "#15151b" : "#121a15"

  return (
    <RigidBody
      ref={rbRef}
      position={[playerId === 1 ? -1 : 1, 2.5, 0]}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      angularDamping={0}
      onCollisionEnter={handleCollisionEnter}
      onCollisionExit={handleCollisionExit}
      colliders={false}
      mass={1}
    >
      <CapsuleCollider args={[0.35, 0.38]} />

      <group ref={squashGroupRef}>
        <group ref={meshRef}>
          {/* Roblox Humanoid Root Torso Group */}
          <group ref={torsoRef}>
            {/* Torso Box */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.5, 0.6, 0.26]} />
              <meshStandardMaterial
                color={pColorTorso}
                metalness={0.4}
                roughness={0.3}
              />
            </mesh>

            {/* Glowing Chest Core */}
            <mesh position={[0, 0.1, 0.135]}>
              <boxGeometry args={[0.16, 0.16, 0.02]} />
              <meshStandardMaterial
                color={pColorAccent}
                emissive={pColorAccent}
                emissiveIntensity={1.5}
              />
            </mesh>

            {/* Head (Helmet) */}
            <group ref={headRef} position={[0, 0.45, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshStandardMaterial
                  color="#1a1a22"
                  metalness={0.6}
                  roughness={0.2}
                />
              </mesh>

              {/* Glowing Visor */}
              <mesh position={[0, 0.02, 0.155]}>
                <boxGeometry args={[0.24, 0.12, 0.02]} />
                <meshStandardMaterial
                  color={pColorAccent}
                  emissive={pColorAccent}
                  emissiveIntensity={2.5}
                />
              </mesh>
            </group>

            {/* Left Arm Pivot Group */}
            <group ref={leftArmRef} position={[-0.34, 0.2, 0]}>
              <mesh position={[0, -0.22, 0]} castShadow>
                <boxGeometry args={[0.15, 0.48, 0.15]} />
                <meshStandardMaterial
                  color={pColorArm}
                  metalness={0.4}
                  roughness={0.3}
                />
              </mesh>
              <mesh position={[-0.015, -0.05, 0]}>
                <boxGeometry args={[0.16, 0.05, 0.16]} />
                <meshStandardMaterial
                  color={pColorAccent}
                  emissive={pColorAccent}
                  emissiveIntensity={1.0}
                />
              </mesh>
            </group>

            {/* Right Arm Pivot Group */}
            <group ref={rightArmRef} position={[0.34, 0.2, 0]}>
              <mesh position={[0, -0.22, 0]} castShadow>
                <boxGeometry args={[0.15, 0.48, 0.15]} />
                <meshStandardMaterial
                  color={pColorArm}
                  metalness={0.4}
                  roughness={0.3}
                />
              </mesh>
              <mesh position={[0.015, -0.05, 0]}>
                <boxGeometry args={[0.16, 0.05, 0.16]} />
                <meshStandardMaterial
                  color={pColorAccent}
                  emissive={pColorAccent}
                  emissiveIntensity={1.0}
                />
              </mesh>
            </group>

            {/* Left Leg Pivot Group */}
            <group ref={leftLegRef} position={[-0.16, -0.28, 0]}>
              <mesh position={[0, -0.24, 0]} castShadow>
                <boxGeometry args={[0.18, 0.48, 0.18]} />
                <meshStandardMaterial
                  color={pColorLeg}
                  metalness={0.3}
                  roughness={0.5}
                />
              </mesh>
              <mesh position={[0, -0.42, 0]}>
                <boxGeometry args={[0.19, 0.08, 0.19]} />
                <meshStandardMaterial
                  color={pColorBoots}
                  emissive={pColorBoots}
                  emissiveIntensity={1.2}
                />
              </mesh>
            </group>

            {/* Right Leg Pivot Group */}
            <group ref={rightLegRef} position={[0.16, -0.28, 0]}>
              <mesh position={[0, -0.24, 0]} castShadow>
                <boxGeometry args={[0.18, 0.48, 0.18]} />
                <meshStandardMaterial
                  color={pColorLeg}
                  metalness={0.3}
                  roughness={0.5}
                />
              </mesh>
              <mesh position={[0, -0.42, 0]}>
                <boxGeometry args={[0.19, 0.08, 0.19]} />
                <meshStandardMaterial
                  color={pColorBoots}
                  emissive={pColorBoots}
                  emissiveIntensity={1.2}
                />
              </mesh>
            </group>

            {/* Jetpack */}
            <mesh position={[0, 0, -0.22]} rotation={[0.08, 0, 0]}>
              <boxGeometry args={[0.36, 0.44, 0.18]} />
              <meshStandardMaterial
                ref={jetpackMatRef}
                color={pColorBoots}
                metalness={0.6}
                roughness={0.2}
                emissive={playerId === 1 ? "#7b2ff7" : "#00ffff"}
                emissiveIntensity={0.5}
              />
            </mesh>
          </group>
        </group>
      </group>
    </RigidBody>
  )
}
