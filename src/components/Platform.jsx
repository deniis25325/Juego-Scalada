import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import useGameStore from '../store/useGameStore'
import audioSystem from '../utils/audioSystem'

// ── Shared Geometries (Declared at module level to prevent GPU re-allocations) ──
const boxGeom = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeom = new THREE.CylinderGeometry(1, 1, 1, 12);
const torusGeom = new THREE.TorusGeometry(0.9, 0.07, 8, 24);
const ringGeom = new THREE.RingGeometry(0, 1, 16);
const planeGeom = new THREE.PlaneGeometry(1, 1);

// ── Shared Materials Cache ──
const materialCache = {};
function getSharedMaterial(color, emissive, emissiveIntensity, metalness, roughness, transparent = false, opacity = 1, side = THREE.FrontSide, depthWrite = true) {
  const key = `${color}_${emissive}_${emissiveIntensity}_${metalness}_${roughness}_${transparent}_${opacity}_${side}_${depthWrite}`;
  if (!materialCache[key]) {
    materialCache[key] = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(emissive),
      emissiveIntensity,
      metalness,
      roughness,
      transparent,
      opacity,
      side,
      depthWrite
    });
  }
  return materialCache[key];
}

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

// ── SUBCOMPONENTS TO PREVENT useFrame ON STATIC PLATFORMS ──

function CheckpointPlatform({ position, size, rotation }) {
  const ringRef = useRef();
  const checkpointPos = useGameStore(s => s.checkpointPos);
  const setCheckpoint = useGameStore(s => s.setCheckpoint);

  const isActive =
    Math.abs(checkpointPos[0] - position[0]) < 0.1 &&
    Math.abs(checkpointPos[1] - (position[1] + size[1] / 2)) < 0.1 &&
    Math.abs(checkpointPos[2] - position[2]) < 0.1;

  useFrame((state, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.y += delta * 1.4;
      ringRef.current.position.y = size[1] / 2 + 1.1 + Math.sin(state.clock.getElapsedTime() * 2.8) * 0.08;
    }
  });

  const handleCollisionEnter = () => {
    if (!isActive) {
      // Store the TOP SURFACE of the platform (center + half-height)
      // The respawn code adds SAFE_SPAWN_OFFSET on top of this value
      setCheckpoint([position[0], position[1] + size[1] / 2, position[2]]);
      audioSystem.playSFX('checkpoint');
    }
  };

  const baseMat = getSharedMaterial(isActive ? '#102e1b' : '#261b12', '#000000', 0, 0.7, 0.3);
  const torusMat = getSharedMaterial(isActive ? '#39ff14' : '#ff9900', isActive ? '#39ff14' : '#ff9900', isActive ? 2.5 : 0.8, 0.5, 0.5);

  return (
    <RigidBody
      type="fixed"
      position={position}
      rotation={rotation}
      colliders="cuboid"
      friction={1.5}
      onCollisionEnter={handleCollisionEnter}
    >
      <group>
        {/* Base plate */}
        <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={baseMat} />
        {/* Floating Torus Gate */}
        <group ref={ringRef} position={[0, size[1] / 2 + 1.1, 0]}>
          <mesh castShadow geometry={torusGeom} material={torusMat} />
          <pointLight
            color={isActive ? '#39ff14' : '#ff9900'}
            intensity={isActive ? 2.2 : 0.6}
            distance={6}
          />
        </group>
      </group>
    </RigidBody>
  );
}

function MovingPlatform({ position, size, rotation, type, isMobile }) {
  const rbRef = useRef();
  const timeRef = useRef(Math.random() * Math.PI * 2);
  const originRef = useRef(position);

  const mobileAxis = isMobile?.axis || 'x';
  const mobileRange = isMobile?.range || 0;
  const mobileSpeed = isMobile?.speed || 0;

  const { color, emissive, emissiveIntensity } = getPlatformStyle(type, size, true);

  useFrame((state, delta) => {
    if (rbRef.current) {
      timeRef.current += delta * mobileSpeed;
      const offset = Math.sin(timeRef.current) * mobileRange;
      const [ox, oy, oz] = originRef.current;

      try {
        rbRef.current.setTranslation(
          mobileAxis === 'x'
            ? { x: ox + offset, y: oy, z: oz }
            : { x: ox,          y: oy, z: oz + offset },
          true
        );
      } catch (e) {
        // Ignorar errores de puntero nulo cuando la plataforma se destruye o desmonta
      }
    }
  });

  const mainMat = getSharedMaterial(color, emissive, emissiveIntensity * 0.3, 0.7, 0.2);
  const glowMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 1.2, 0.5, 0.5, true, 0.12, THREE.BackSide);
  const topMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 2.4, 0.5, 0.5, true, 0.25);

  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      position={position}
      rotation={rotation}
      colliders="cuboid"
      friction={1.5}
    >
      <group>
        <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
        <mesh geometry={boxGeom} scale={[size[0] + 0.06, size[1] + 0.06, size[2] + 0.06]} material={glowMat} />
        <mesh
          position={[0, size[1] / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={planeGeom}
          scale={[size[0] - 0.1, size[2] - 0.1, 1]}
          material={topMat}
        />
      </group>
    </RigidBody>
  );
}

function StaticPlatform({ position, size, rotation = [0, 0, 0], type = 'standard' }) {
  const { color, emissive, emissiveIntensity } = getPlatformStyle(type, size, false);

  let renderContent = null;

  switch (type) {
    case 'ruin_pillar': {
      const colMat = getSharedMaterial(color, '#000000', 0, 0.7, 0.3);
      const ringLightMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 1.5, 0.5, 0.5);
      const topRingMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 2.0, 0.5, 0.5, false, 1, THREE.DoubleSide);

      renderContent = (
        <group>
          <mesh receiveShadow castShadow geometry={cylinderGeom} scale={[size[0] / 2, size[1], size[0] / 2]} material={colMat} />
          {[-size[1] / 3, size[1] / 3].map((yOffset, i) => (
            <mesh key={i} position={[0, yOffset, 0]} geometry={cylinderGeom} scale={[size[0] / 2 + 0.02, 0.06, size[0] / 2 + 0.02]} material={ringLightMat} />
          ))}
          <mesh position={[0, size[1] / 2 + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeom} scale={[size[0] / 2 - 0.02, size[0] / 2 - 0.02, 1]} material={topRingMat} />
        </group>
      );
      break;
    }

    case 'bridge': {
      const mainMat = getSharedMaterial(color, '#000000', 0, 0.8, 0.2);
      const sideMat = getSharedMaterial(emissive, emissive, emissiveIntensity, 0.5, 0.5);

      renderContent = (
        <group>
          <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
          <mesh position={[-size[0] / 2 + 0.05, 0.1, 0]} geometry={boxGeom} scale={[0.06, 0.15, size[2]]} material={sideMat} />
          <mesh position={[size[0] / 2 - 0.05, 0.1, 0]} geometry={boxGeom} scale={[0.06, 0.15, size[2]]} material={sideMat} />
        </group>
      );
      break;
    }

    case 'ramp': {
      const mainMat = getSharedMaterial(color, '#000000', 0, 0.6, 0.3);
      const stepMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 1.8, 0.5, 0.5, true, 0.8);

      renderContent = (
        <group>
          <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
          {[-1.5, 0, 1.5].map((zOffset, idx) => (
            <mesh key={idx} position={[0, size[1] / 2 + 0.015, zOffset]} rotation={[-Math.PI / 2, 0, 0]} geometry={planeGeom} scale={[size[0] * 0.4, 0.2, 1]} material={stepMat} />
          ))}
        </group>
      );
      break;
    }

    case 'giant': {
      const mainMat = getSharedMaterial(color, '#000000', 0, 0.9, 0.1);
      const cornerMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 1.4, 0.5, 0.5);

      renderContent = (
        <group>
          <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
          {[
            [-size[0] / 2, -size[2] / 2],
            [-size[0] / 2,  size[2] / 2],
            [ size[0] / 2, -size[2] / 2],
            [ size[0] / 2,  size[2] / 2]
          ].map(([cx, cz], idx) => (
            <mesh key={idx} position={[cx, 0, cz]} geometry={boxGeom} scale={[0.08, size[1] + 0.02, 0.08]} material={cornerMat} />
          ))}
        </group>
      );
      break;
    }

    case 'zigzag': {
      const mainMat = getSharedMaterial(color, emissive, emissiveIntensity * 0.4, 0.5, 0.2);
      const glowMat = getSharedMaterial(emissive, emissive, emissiveIntensity, 0.5, 0.5, true, 0.15, THREE.BackSide);

      renderContent = (
        <group rotation={[0, Math.PI / 4, 0]}>
          <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
          <mesh geometry={boxGeom} scale={[size[0] + 0.04, size[1] + 0.04, size[2] + 0.04]} material={glowMat} />
        </group>
      );
      break;
    }

    case 'ruins': {
      const mainMat = getSharedMaterial(color, '#000000', 0, 0.7, 0.4);
      const topPlateMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 1.5, 0.5, 0.5, true, 0.3);

      renderContent = (
        <group>
          <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
          <mesh position={[0, size[1] / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={planeGeom} scale={[size[0] - 0.2, size[2] - 0.2, 1]} material={topPlateMat} />
        </group>
      );
      break;
    }

    case 'standard':
    default: {
      const mainMat = getSharedMaterial(color, emissive, emissiveIntensity * 0.3, 0.7, 0.2);
      const glowMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 1.2, 0.5, 0.5, true, 0.12, THREE.BackSide);
      const topMat = getSharedMaterial(emissive, emissive, emissiveIntensity * 2.4, 0.5, 0.5, true, 0.25);

      renderContent = (
        <group>
          <mesh receiveShadow castShadow geometry={boxGeom} scale={size} material={mainMat} />
          <mesh geometry={boxGeom} scale={[size[0] + 0.06, size[1] + 0.06, size[2] + 0.06]} material={glowMat} />
          <mesh
            position={[0, size[1] / 2 + 0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            geometry={planeGeom}
            scale={[size[0] - 0.1, size[2] - 0.1, 1]}
            material={topMat}
          />
        </group>
      );
      break;
    }
  }

  return (
    <RigidBody
      type="fixed"
      position={position}
      rotation={rotation}
      colliders="cuboid"
      friction={1.5}
    >
      {renderContent}
    </RigidBody>
  );
}

// ── MAIN EXPORT COMPONENT ──
export default function Platform(props) {
  if (props.type === 'checkpoint') {
    return <CheckpointPlatform {...props} />;
  }
  if (props.isMobile) {
    return <MovingPlatform {...props} />;
  }
  return <StaticPlatform {...props} />;
}
