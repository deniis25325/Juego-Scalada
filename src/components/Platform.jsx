import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

// Color palette for platforms based on structure type and size
function getPlatformStyle(type, size, isMoving) {
  if (isMoving) return { color: '#cc3366', emissive: '#ff0066', emissiveIntensity: 0.6 };

  switch (type) {
    case 'checkpoint':
      return { color: '#221a10', emissive: '#ffaa00', emissiveIntensity: 0.8 };
    case 'bridge':
      return { color: '#1f2530', emissive: '#ff00ff', emissiveIntensity: 0.8 };
    case 'ramp':
      return { color: '#3d1d04', emissive: '#ff6600', emissiveIntensity: 1.0 };
    case 'giant':
      return { color: '#151c24', emissive: '#00ffff', emissiveIntensity: 0.7 };
    case 'zigzag':
      return { color: '#4a154b', emissive: '#e01e5a', emissiveIntensity: 1.2 };
    case 'ruins':
      return { color: '#102528', emissive: '#39ff14', emissiveIntensity: 0.6 };
    case 'ruin_pillar':
      return { color: '#161d20', emissive: '#39ff14', emissiveIntensity: 0.9 };
    case 'standard':
    default:
      if (size[0] >= 4) return { color: '#123c52', emissive: '#00e5ff', emissiveIntensity: 0.5 };
      if (size[0] >= 3) return { color: '#1f2952', emissive: '#3d5afe', emissiveIntensity: 0.5 };
      if (size[0] >= 2) return { color: '#311b57', emissive: '#651fff', emissiveIntensity: 0.5 };
      return                   { color: '#3f0d4f', emissive: '#d500f9', emissiveIntensity: 0.5 };
  }
}

export default function Platform({
  position,
  size,
  rotation = [0, 0, 0],
  type = 'standard',
  isMobile = false
}) {
  const rbRef = useRef();
  const ringRef = useRef();
  const timeRef = useRef(Math.random() * Math.PI * 2);
  const originRef = useRef(position);

  const checkpointPos = useGameStore(s => s.checkpointPos);
  const setCheckpoint = useGameStore(s => s.setCheckpoint);

  const isMoving = !!isMobile;
  const mobileAxis = isMobile?.axis || 'x';
  const mobileRange = isMobile?.range || 0;
  const mobileSpeed = isMobile?.speed || 0;

  // Check if this checkpoint platform is the active one
  const isActive = type === 'checkpoint' &&
    Math.abs(checkpointPos[0] - position[0]) < 0.1 &&
    Math.abs(checkpointPos[1] - 1.2 - position[1]) < 0.1 &&
    Math.abs(checkpointPos[2] - position[2]) < 0.1;

  const { color, emissive, emissiveIntensity } = getPlatformStyle(type, size, isMoving);

  useFrame((state, delta) => {
    // ── Platform movement (kinematic) ─────────────────────────────────
    if (isMoving && rbRef.current) {
      timeRef.current += delta * mobileSpeed;
      const offset = Math.sin(timeRef.current) * mobileRange;
      const [ox, oy, oz] = originRef.current;

      rbRef.current.setTranslation(
        mobileAxis === 'x'
          ? { x: ox + offset, y: oy, z: oz }
          : { x: ox,          y: oy, z: oz + offset },
        true
      );
    }

    // ── Checkpoint Gate visual hover / rotation ───────────────────────
    if (type === 'checkpoint' && ringRef.current) {
      ringRef.current.rotation.y += delta * 1.4;
      ringRef.current.position.y = size[1] / 2 + 1.1 + Math.sin(state.clock.getElapsedTime() * 2.8) * 0.08;
    }
  });

  const handleCollisionEnter = () => {
    // Activate checkpoint on player landing
    if (type === 'checkpoint' && !isActive) {
      setCheckpoint([position[0], position[1] + 1.2, position[2]]);
      audioSystem.playSFX('checkpoint');
    }
  };

  return (
    <RigidBody
      ref={rbRef}
      type={isMoving ? 'kinematicPosition' : 'fixed'}
      position={position}
      rotation={rotation}
      colliders="cuboid"
      friction={1.5}
      onCollisionEnter={handleCollisionEnter}
    >
      {/* ── RENDERING BY STRUCTURE TYPE ──────────────────────────────── */}
      
      {/* CHECKPOINT PLATFORM */}
      {type === 'checkpoint' && (
        <group>
          {/* Base plate */}
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={isActive ? '#102e1b' : '#261b12'}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          {/* Floating Torus Gate */}
          <group ref={ringRef} position={[0, size[1] / 2 + 1.1, 0]}>
            <mesh castShadow>
              <torusGeometry args={[0.9, 0.07, 8, 24]} />
              <meshStandardMaterial
                color={isActive ? '#39ff14' : '#ff9900'}
                emissive={isActive ? '#39ff14' : '#ff9900'}
                emissiveIntensity={isActive ? 2.5 : 0.8}
              />
            </mesh>
            <pointLight
              color={isActive ? '#39ff14' : '#ff9900'}
              intensity={isActive ? 2.2 : 0.6}
              distance={6}
            />
          </group>
        </group>
      )}

      {/* RUINS PILLAR */}
      {type === 'ruin_pillar' && (
        <group>
          <mesh receiveShadow castShadow>
            <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 12]} />
            <meshStandardMaterial
              color={color}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          {[-size[1] / 3, size[1] / 3].map((yOffset, i) => (
            <mesh key={i} position={[0, yOffset, 0]}>
              <cylinderGeometry args={[size[0] / 2 + 0.02, size[0] / 2 + 0.02, 0.06, 12]} />
              <meshStandardMaterial
                color={emissive}
                emissive={emissive}
                emissiveIntensity={emissiveIntensity * 1.5}
              />
            </mesh>
          ))}
          <mesh position={[0, size[1] / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0, size[0] / 2 - 0.02, 16]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 2.0}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}

      {/* BRIDGE */}
      {type === 'bridge' && (
        <group>
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={color}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[-size[0] / 2 + 0.05, 0.1, 0]}>
            <boxGeometry args={[0.06, 0.15, size[2]]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
          <mesh position={[size[0] / 2 - 0.05, 0.1, 0]}>
            <boxGeometry args={[0.06, 0.15, size[2]]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
            />
          </mesh>
        </group>
      )}

      {/* RAMP */}
      {type === 'ramp' && (
        <group>
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={color}
              metalness={0.6}
              roughness={0.3}
            />
          </mesh>
          {[-1.5, 0, 1.5].map((zOffset, idx) => (
            <mesh key={idx} position={[0, size[1] / 2 + 0.015, zOffset]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[size[0] * 0.4, 0.2]} />
              <meshStandardMaterial
                color={emissive}
                emissive={emissive}
                emissiveIntensity={emissiveIntensity * 1.8}
                transparent
                opacity={0.8}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* GIANT BLOCK */}
      {type === 'giant' && (
        <group>
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={color}
              metalness={0.9}
              roughness={0.1}
            />
          </mesh>
          {[
            [-size[0] / 2, -size[2] / 2],
            [-size[0] / 2,  size[2] / 2],
            [ size[0] / 2, -size[2] / 2],
            [ size[0] / 2,  size[2] / 2]
          ].map(([cx, cz], idx) => (
            <mesh key={idx} position={[cx, 0, cz]}>
              <boxGeometry args={[0.08, size[1] + 0.02, 0.08]} />
              <meshStandardMaterial
                color={emissive}
                emissive={emissive}
                emissiveIntensity={emissiveIntensity * 1.4}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* ZIGZAG */}
      {type === 'zigzag' && (
        <group rotation={[0, Math.PI / 4, 0]}>
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={color}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 0.4}
              metalness={0.5}
              roughness={0.2}
            />
          </mesh>
          <mesh>
            <boxGeometry args={[size[0] + 0.04, size[1] + 0.04, size[2] + 0.04]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity}
              transparent
              opacity={0.15}
              side={THREE.BackSide}
            />
          </mesh>
        </group>
      )}

      {/* RUINS */}
      {type === 'ruins' && (
        <group>
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={color}
              metalness={0.7}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, size[1] / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[size[0] - 0.2, size[2] - 0.2]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 1.5}
              transparent
              opacity={0.3}
            />
          </mesh>
        </group>
      )}

      {/* STANDARD / DEFAULT PLATFORM */}
      {type === 'standard' && (
        <group>
          <mesh receiveShadow castShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial
              color={color}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 0.3}
              metalness={0.7}
              roughness={0.2}
            />
          </mesh>

          <mesh>
            <boxGeometry args={[size[0] + 0.06, size[1] + 0.06, size[2] + 0.06]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 1.2}
              transparent
              opacity={0.12}
              side={THREE.BackSide}
            />
          </mesh>

          <mesh
            position={[0, size[1] / 2 + 0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[size[0] - 0.1, size[2] - 0.1]} />
            <meshStandardMaterial
              color={emissive}
              emissive={emissive}
              emissiveIntensity={emissiveIntensity * 2.4}
              transparent
              opacity={0.25}
            />
          </mesh>
        </group>
      )}
    </RigidBody>
  );
}
