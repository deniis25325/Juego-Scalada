import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier'
import { useKeyboardControls } from '@react-three/drei'
import { Vector3 } from 'three'
import useGameStore from '../store/useGameStore'
import { emitDust, emitRing, triggerShake } from '../utils/gameEvents'
import audioSystem from '../utils/audioSystem'

const SPEED    = 9
const JUMP_VEL = 13
const DEATH_Y  = -25
const DAMPING  = 8

// Safe vertical margin above platform surface for spawning.
// CapsuleCollider half-height(0.35) + radius(0.38) = 0.73 from center to bottom.
// We want the bottom of the capsule to clear the top of the platform by ~0.1 units.
const SAFE_SPAWN_OFFSET = 0.85

// Reusable module-level vectors (no allocations per frame)
const _camDir  = new Vector3()
const _right   = new Vector3()
const _up      = new Vector3(0, 1, 0)
const _moveDir = new Vector3()

// Global positions and velocities for coordinate referencing in multiplayer coop respawns
window.player1Pos = { x: 0, y: 0.6, z: 0 }
window.player2Pos = { x: 0, y: 0.6, z: 0 }
window.player1Vel = { x: 0, y: 0, z: 0 }
window.player2Vel = { x: 0, y: 0, z: 0 }
window.player1Respawning = false
window.player2Respawning = false

export default function Player({ playerId = 1, playerPosRef }) {
  const { rapier, world } = useRapier()
  const rbRef          = useRef()
  const isGrounded     = useRef(false)
  const groundContacts = useRef(0)
  const wasGroundedRef = useRef(false)  // landing detection
  const multiplayerMode = useGameStore(s => s.multiplayerMode)
  const isHost          = useGameStore(s => s.isHost)
  const isRemote = multiplayerMode === 'online' && (
    (isHost && playerId === 2) || 
    (!isHost && playerId === 1)
  )
  const lastBroadcastRef = useRef(0)
  const wallJumpTimerRef = useRef(0)
  const jumpBufferRef    = useRef(0) // Ventana de 150ms para amortiguar inputs de salto
  const wasJumpRef     = useRef(false)  // prevent hold-to-jump
  const coyoteRef      = useRef(0)      // grace window after leaving platform
  const isRespawning   = useRef(false)
  const respawnTimeoutRef = useRef(null)
  const prevVersionRef = useRef(0)
  const prevReviveRef  = useRef(0)
  const respawnTargetRef = useRef({ x: 0, y: -0.25 + 0.85, z: 0 })

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
  const levelVersion    = useGameStore(s => s.levelVersion)
  const reviveCount     = useGameStore(s => s.reviveCount)

  // Reset physics on new game / retry / revive
  useEffect(() => {
    if (phase === 'playing' && rbRef.current) {
      const checkpointPos = useGameStore.getState().checkpointPos
      const spawnX = playerId === 1 ? -1.2 : 1.2

      // Reset respawn state
      isRespawning.current = false
      if (playerId === 1) {
        window.player1Respawning = false
      } else {
        window.player2Respawning = false
      }

      let sx, sy, sz
      if (levelVersion !== prevVersionRef.current) {
        // Normal start/restart: spawn at start base (which is at -0.25)
        sx = multiplayer ? spawnX : 0
        sy = -0.25 + SAFE_SPAWN_OFFSET
        sz = 0
        
        prevVersionRef.current = levelVersion
        prevReviveRef.current = reviveCount
      } else if (reviveCount !== prevReviveRef.current) {
        // Revive: spawn at the last safe grounded position!
        sx = checkpointPos[0] + (multiplayer ? spawnX : 0)
        sy = checkpointPos[1] + SAFE_SPAWN_OFFSET
        sz = checkpointPos[2]
        
        prevReviveRef.current = reviveCount
      } else {
        return
      }

      rbRef.current.setTranslation({ x: sx, y: sy, z: sz }, true)
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
    }
  }, [phase, levelVersion, reviveCount, multiplayer, playerId])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (respawnTimeoutRef.current) clearTimeout(respawnTimeoutRef.current)
    }
  }, [])

  const [, getKeys] = useKeyboardControls()

  useFrame((state, delta) => {
    if (!rbRef.current || phase === 'ready' || phase === 'dead') return

    // Decrement wall jump and jump buffer timers
    wallJumpTimerRef.current = Math.max(0, wallJumpTimerRef.current - delta)
    jumpBufferRef.current    = Math.max(0, jumpBufferRef.current - delta)

    // ── Respawn Handling (Freeze during transition) ───────────────────
    if (isRespawning.current) {
      rbRef.current.setTranslation(respawnTargetRef.current, true)
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)

      // Keep position refs updated so PlatformManager doesn't cull checkpoint platform
      if (playerPosRef) {
        playerPosRef.current.x = respawnTargetRef.current.x
        playerPosRef.current.y = respawnTargetRef.current.y
        playerPosRef.current.z = respawnTargetRef.current.z
      }
      if (playerId === 1) {
        window.player1Pos = { ...respawnTargetRef.current }
      } else {
        window.player2Pos = { ...respawnTargetRef.current }
      }
      return
    }

    // ── Pause State Handling ──────────────────────────────────────────
    if (phase === 'paused') {
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
      return
    }

    // ── Player-specific input controls ───────────────────────────────
    const keys = getKeys()
    const kForward   = playerId === 1 ? keys.p1_forward   : keys.p2_forward
    const kBackward  = playerId === 1 ? keys.p1_backward  : keys.p2_backward
    const kLeftward  = playerId === 1 ? keys.p1_leftward  : keys.p2_leftward
    const kRightward = playerId === 1 ? keys.p1_rightward : keys.p2_rightward
    const kJump      = playerId === 1 ? keys.p1_jump      : keys.p2_jump

    // Mobile inputs read directly from Zustand state to prevent rerenders
    const storeState = useGameStore.getState()
    const joystickX = playerId === 1 ? storeState.joystickX : 0
    const joystickY = playerId === 1 ? storeState.joystickY : 0
    const touchJump = playerId === 1 ? storeState.touchJump : false

    const jump = kJump || touchJump

    // Consumir el estado de salto táctil de inmediato para evitar que se quede pegado si se pierde el evento pointerup
    if (touchJump && playerId === 1) {
      useGameStore.setState({ touchJump: false })
    }

    const translation = rbRef.current.translation()
    const linvel      = rbRef.current.linvel()
    let vx            = linvel.x
    let vz            = linvel.z
    let vy            = linvel.y

    // ── REMOTE PLAYER REPLICATION (FASE 3) ──────────────────────────────
    if (isRemote) {
      const remoteState = useGameStore.getState().remotePlayerState
      if (remoteState) {
        // Interpolación lineal visual (lerp) para mitigar el lag de red
        const tFactor = 0.22
        const currentPos = rbRef.current.translation()
        const targetPos = remoteState.position
        
        if (targetPos) {
          rbRef.current.setTranslation({
            x: currentPos.x + (targetPos.x - currentPos.x) * tFactor,
            y: currentPos.y + (targetPos.y - currentPos.y) * tFactor,
            z: currentPos.z + (targetPos.z - currentPos.z) * tFactor
          }, true)
        }

        // Sincronizar velocidad para las piernas/brazos locales
        if (remoteState.velocity) {
          rbRef.current.setLinvel(remoteState.velocity, true)
        }

        // Sincronizar estados booleanos
        isGrounded.current = remoteState.isGrounded
        isRespawning.current = remoteState.isRespawning
        
        const vx = remoteState.velocity?.x || 0
        const vz = remoteState.velocity?.z || 0
        const vy = remoteState.velocity?.y || 0
        const runSpeed = Math.sqrt(vx * vx + vz * vz)
        const hasInput = remoteState.hasInput
        const _moveDir = remoteState.moveDir || { x: 0, y: 0, z: 0 }

        // Actualizaciones estéticas de squash/stretch
        if (squashGroupRef.current) {
          const sc  = squashGroupRef.current.scale
          const spd = Math.min(1, 11 * delta)
          sc.x += (1 - sc.x) * spd
          sc.y += (1 - sc.y) * spd
          sc.z += (1 - sc.z) * spd
        }

        if (meshRef.current) {
          if (hasInput) {
            meshRef.current.rotation.y = Math.atan2(_moveDir.x, _moveDir.z)
          }
          const targetLean = hasInput ? -runSpeed * 0.024 : 0
          meshRef.current.rotation.x +=
            (targetLean - meshRef.current.rotation.x) * 9 * delta
        }

        if (jetpackMatRef.current) {
          const targetEmissive = isGrounded.current ? 0.5 : 3.2
          jetpackMatRef.current.emissiveIntensity +=
            (targetEmissive - jetpackMatRef.current.emissiveIntensity) * 5 * delta
        }

        if (isGrounded.current && runSpeed > 0.2) {
          walkTimeRef.current = (walkTimeRef.current || 0) + delta * runSpeed * 1.6
        } else if (isGrounded.current) {
          if (walkTimeRef.current !== undefined) {
            walkTimeRef.current = walkTimeRef.current * Math.max(0, 1 - 10 * delta)
          }
        }

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

        if (playerPosRef) {
          playerPosRef.current.x = translation.x
          playerPosRef.current.y = translation.y
          playerPosRef.current.z = translation.z
        }
      }
      return // Finalizar procesamiento del frame para jugador remoto
    }

    // ── Timeout connection check ───────────────────────────────────────
    if (multiplayerMode === 'online' && !isRemote) {
      const lastTs = useGameStore.getState().lastPacketTimestamp
      const isOnlineActive = useGameStore.getState().activeRoom?.status === 'ready'
      if (isOnlineActive && lastTs > 0 && Date.now() - lastTs > 5000) {
        useGameStore.getState().handleOnlineDisconnect("Se perdió la conexión con el otro jugador (Timeout de 5 segundos).")
      }
    }

    // Save positions to window for coop coordinate checks
    if (playerId === 1) {
      window.player1Pos = { x: translation.x, y: translation.y, z: translation.z }
      window.player1Respawning = isRespawning.current
    } else {
      window.player2Pos = { x: translation.x, y: translation.y, z: translation.z }
      window.player2Respawning = isRespawning.current
    }

    // ── Safe Fall & Respawn (Bug Fix) ──────────────────────────────────
    if (translation.y < DEATH_Y && !isRespawning.current) {
      isRespawning.current = true
      if (playerId === 1) {
        window.player1Respawning = true
      } else {
        window.player2Respawning = true
      }

      audioSystem.playSFX('fall')

      // Reset internal states to prevent pre-existing jump or coyote calculations on respawn
      isGrounded.current = false
      groundContacts.current = 0
      wasGroundedRef.current = false
      wasJumpRef.current = false
      coyoteRef.current = 0

      // Freeze all movement immediately
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)

      const checkpointPos = useGameStore.getState().checkpointPos

      let respawnX = checkpointPos[0]
      let respawnY = checkpointPos[1] + SAFE_SPAWN_OFFSET
      let respawnZ = checkpointPos[2]
      let isCoopRespawn = false

      if (multiplayer) {
        const otherPos = playerId === 1 ? window.player2Pos : window.player1Pos
        const otherRespawning = playerId === 1 ? window.player2Respawning : window.player1Respawning
        // If buddy is still alive and not respawning, respawn on top of them!
        if (otherPos && otherPos.y > DEATH_Y && !otherRespawning) {
          respawnX = otherPos.x
          respawnY = otherPos.y + 2.0
          respawnZ = otherPos.z
          isCoopRespawn = true
        }
      }

      // Record coordinate target to hold player in place during transition
      respawnTargetRef.current = { x: respawnX, y: respawnY, z: respawnZ }

      // If both fell or single player, show the black screen transition
      if (!isCoopRespawn) {
        useGameStore.setState({ isTransitioning: true })
      }

      rbRef.current.setTranslation(respawnTargetRef.current, true)
      
      // Local effect on buddy respawn destination
      emitDust(respawnX, respawnY - 1.0, respawnZ, 'land')

      respawnTimeoutRef.current = setTimeout(() => {
        // Re-apply exact position & zero velocity one final time before unfreezing
        if (rbRef.current) {
          rbRef.current.setTranslation(respawnTargetRef.current, true)
          rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
          rbRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
        }

        isRespawning.current = false
        if (playerId === 1) {
          window.player1Respawning = false
        } else {
          window.player2Respawning = false
        }

        if (multiplayer && isCoopRespawn) {
          // No global transition screen cleanup needed
        } else {
          // Fall deaths ALWAYS trigger Game Over (since checkpoints are removed, ad needed to continue)
          gameOver()
          useGameStore.setState({ isTransitioning: false })
        }
      }, 600)
      return
    }

    // ── Grounded check (Raycast + Collision Fallback) ──────────────────
    let rayGrounded = false
    if (world && rapier && rbRef.current) {
      // Proyectamos el rayo vertical desde el centro inferior de la cápsula (translation.y - 0.5)
      // con dirección estrictamente descendente (0, -1, 0)
      const startY = translation.y - 0.5
      const ray = new rapier.Ray(
        { x: translation.x, y: startY, z: translation.z },
        { x: 0, y: -1, z: 0 }
      )
      
      const maxToi = 0.38 // 0.23 + 0.15 de tolerancia (15cm por debajo del pie de la cápsula)
      
      const hit = world.castRayAndGetNormal(
        ray,
        maxToi,
        true, // solid
        null, // queryGroups
        null, // filterFlags
        null, // filterCollider
        rbRef.current // excluir propio RigidBody
      )
      
      if (hit && hit.toi < maxToi) {
        // Validamos que el impacto sea contra una superficie plana (normal vertical Ny ~ 1.0)
        // para ignorar paredes y plataformas colindantes laterales
        if (hit.normal && Math.abs(hit.normal.y - 1.0) < 0.15) {
          rayGrounded = true
        }
      }
    }

    const GROUND_VELOCITY_THRESHOLD = 0.15
    isGrounded.current = rayGrounded || (
      groundContacts.current > 0 &&
      Math.abs(vy) < GROUND_VELOCITY_THRESHOLD &&
      vy <= 0.01
    )

    // ── Wall detection (Raycast + Collision contacts fallback) ────────
    let isTouchingWall = (groundContacts.current > 0 && !isGrounded.current)
    const wallNormal = new Vector3()
    
    if (!isGrounded.current && world && rapier && rbRef.current) {
      const dirs = [
        { x: 1, y: 0, z: 0 },  // Right
        { x: -1, y: 0, z: 0 }, // Left
        { x: 0, y: 0, z: 1 },  // Forward
        { x: 0, y: 0, z: -1 }  // Backward
      ]
      
      const maxToi = 0.56 // 0.38 radio de cápsula + 0.18 de tolerancia
      let closestToi = Infinity
      const startPos = { x: translation.x, y: translation.y, z: translation.z }
      
      for (const dir of dirs) {
        const ray = new rapier.Ray(startPos, dir)
        const hit = world.castRayAndGetNormal(
          ray,
          maxToi,
          true,
          null,
          null,
          null,
          rbRef.current
        )
        
        if (hit && hit.toi < closestToi) {
          // Validar que la superficie sea vertical (muro)
          if (hit.normal && Math.abs(hit.normal.y) < 0.25) {
            closestToi = hit.toi
            isTouchingWall = true
            wallNormal.set(hit.normal.x, 0, hit.normal.z).normalize()
          }
        }
      }
    }

    // ── Broadcast state throttled (12 updates/sec) ─────────────────────
    if (multiplayerMode === 'online' && !isRemote) {
      lastBroadcastRef.current += delta
      if (lastBroadcastRef.current >= 0.08) {
        lastBroadcastRef.current = 0
        useGameStore.getState().broadcastLocalState({
          userId: useGameStore.getState().user?.id,
          position: { x: translation.x, y: translation.y, z: translation.z },
          velocity: { x: linvel.x, y: linvel.y, z: linvel.z },
          hasInput,
          moveDir: { x: _moveDir.x, y: _moveDir.y, z: _moveDir.z },
          isGrounded: isGrounded.current,
          isRespawning: isRespawning.current
        })
      }
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
    
    // Add keyboard inputs
    if (kForward)   _moveDir.add(_camDir)
    if (kBackward)  _moveDir.sub(_camDir)
    if (kRightward) _moveDir.add(_right)
    if (kLeftward)  _moveDir.sub(_right)

    let hasInput = _moveDir.lengthSq() > 0.001
    if (hasInput) {
      _moveDir.normalize()
    }

    // Add joystick inputs if active
    const joyLengthSq = joystickX * joystickX + joystickY * joystickY
    const hasJoystickInput = joyLengthSq > 0.001
    let currentSpeed = SPEED

    if (hasJoystickInput) {
      const joyVec = new Vector3()
      joyVec.addScaledVector(_camDir, -joystickY)
      joyVec.addScaledVector(_right, joystickX)
      const joyLength = Math.min(1.0, Math.sqrt(joyLengthSq))

      if (hasInput) {
        _moveDir.add(joyVec)
        if (_moveDir.lengthSq() > 0.001) _moveDir.normalize()
      } else {
        _moveDir.copy(joyVec)
        if (_moveDir.lengthSq() > 0.001) _moveDir.normalize()
      }

      hasInput = true
      currentSpeed = SPEED * joyLength
    }

    // ── Horizontal velocity ─────────────────────────────────────────────
    if (wallJumpTimerRef.current > 0) {
      // Aplicar inercia/fricción durante el bloqueo de input
      vx = vx * Math.max(0, 1 - DAMPING * delta)
      vz = vz * Math.max(0, 1 - DAMPING * delta)
    } else {
      vx = hasInput
        ? _moveDir.x * currentSpeed
        : vx * Math.max(0, 1 - DAMPING * delta)
      vz = hasInput
        ? _moveDir.z * currentSpeed
        : vz * Math.max(0, 1 - DAMPING * delta)
    }

    // vy ya fue declarado en el alcance superior como linvel.y

    // ── Multiplayer Tether (elastic chain + rigid limit mechanical force) ──
    if (multiplayer && phase === 'playing') {
      const otherPos = playerId === 1 ? window.player2Pos : window.player1Pos
      const otherRespawning = playerId === 1 ? window.player2Respawning : window.player1Respawning
      if (otherPos && otherPos.y > DEATH_Y && !isRespawning.current && !otherRespawning) {
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

    // ── Jump / Wall Jump (Con Input Buffering) ──────────────────────────
    const isPressingJump = kJump || touchJump
    if (isPressingJump && !wasJumpRef.current) {
      jumpBufferRef.current = 0.15 // Almacenar el salto durante 150ms
    }
    wasJumpRef.current = isPressingJump

    const canJump = isGrounded.current || coyoteRef.current > 0

    if (jumpBufferRef.current > 0) {
      if (canJump) {
        vy = JUMP_VEL
        coyoteRef.current = 0
        jumpBufferRef.current = 0 // Consumir el buffer
        
        if (squashGroupRef.current) {
          squashGroupRef.current.scale.set(0.70, 1.42, 0.70)
        }
        emitDust(translation.x, translation.y, translation.z, 'jump')
        audioSystem.playSFX('jump')
      } else if (isTouchingWall) {
        // Wall Jump vertical climb!
        vy = JUMP_VEL * 0.85
        wallJumpTimerRef.current = 0
        jumpBufferRef.current = 0 // Consumir el buffer
        
        if (squashGroupRef.current) {
          squashGroupRef.current.scale.set(0.85, 1.25, 0.85)
        }
        emitDust(translation.x, translation.y, translation.z, 'jump')
        audioSystem.playSFX('jump')
      }
    }

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
      setHeight(translation.y - 0.6)
    }

    // ── Grounded Position Tracking (For ad-continues) ─────────────────
    if (isGrounded.current && translation.y > -0.2 && !isRespawning.current) {
      useGameStore.setState({ checkpointPos: [translation.x, translation.y, translation.z] })
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
      position={[playerId === 1 ? -1 : 1, -0.25 + SAFE_SPAWN_OFFSET, 0]}
      enabledRotations={[false, false, false]}
      linearDamping={0}
      angularDamping={0}
      onCollisionEnter={isRemote ? undefined : handleCollisionEnter}
      onCollisionExit={isRemote ? undefined : handleCollisionExit}
      colliders={false}
      mass={1}
      type={isRemote ? "kinematicPosition" : "dynamic"}
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
