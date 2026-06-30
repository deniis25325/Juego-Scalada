import { useRef, Suspense, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { KeyboardControls, Stars, Sky } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import * as THREE from 'three'
import Player from './components/Player'
import PlatformManager from './components/PlatformManager'
import Camera from './components/Camera'
import JumpDust from './components/JumpDust'
import LandingRing from './components/LandingRing'
import TetherLine from './components/TetherLine'
import HUD from './components/HUD'
import GameOverlay from './components/GameOverlay'
import HeightMilestone from './components/HeightMilestone'
import AuthModal from './components/AuthModal'
import LeaderboardModal from './components/LeaderboardModal'
import VirtualJoystick from './components/VirtualJoystick'
import JumpButton from './components/JumpButton'
import useGameStore from './store/useGameStore'
import audioSystem from './utils/audioSystem'
import GoogleAd from './components/GoogleAd'

const KEYBOARD_MAP = [
  // Player 1 controls
  { name: 'p1_forward',   keys: ['KeyW'] },
  { name: 'p1_backward',  keys: ['KeyS'] },
  { name: 'p1_leftward',  keys: ['KeyA'] },
  { name: 'p1_rightward', keys: ['KeyD'] },
  { name: 'p1_jump',      keys: ['Space'] },

  // Player 2 controls
  { name: 'p2_forward',   keys: ['ArrowUp'] },
  { name: 'p2_backward',  keys: ['ArrowDown'] },
  { name: 'p2_leftward',  keys: ['ArrowLeft'] },
  { name: 'p2_rightward', keys: ['ArrowRight'] },
  { name: 'p2_jump',      keys: ['Enter'] },
]

const SCENE_CONFIGS = {
  default: {
    skyColor: '#00000c',
    sunPos: [0, -1, 0],
    fogColor: '#020208',
    fogNear: 15,
    fogFar: 85,
    ambientColor: '#8888bb',
    ambientIntensity: 0.35,
    dirLightColor: '#ffffff',
    dirLightIntensity: 1.2,
    pointLight1Color: '#00d4ff',
    pointLight2Color: '#7b2ff7',
    starsCount: 4000,
  },
  fog: {
    skyColor: '#0c151c',
    sunPos: [0, -0.2, 0.8],
    fogColor: '#0c151c',
    fogNear: 2,
    fogFar: 30,
    ambientColor: '#3a5866',
    ambientIntensity: 0.25,
    dirLightColor: '#00e5ff',
    dirLightIntensity: 0.7,
    pointLight1Color: '#00ffaa',
    pointLight2Color: '#00e5ff',
    starsCount: 800,
  },
  neon: {
    skyColor: '#06000c',
    sunPos: [0, -1, 0],
    fogColor: '#06000c',
    fogNear: 20,
    fogFar: 100,
    ambientColor: '#ff00ff',
    ambientIntensity: 0.35,
    dirLightColor: '#00ffff',
    dirLightIntensity: 1.4,
    pointLight1Color: '#ff00ff',
    pointLight2Color: '#00ffff',
    starsCount: 5000,
  },
  dark: {
    skyColor: '#000000',
    sunPos: [0, -1, 0],
    fogColor: '#000000',
    fogNear: 8,
    fogFar: 45,
    ambientColor: '#1a1a1a',
    ambientIntensity: 0.12,
    dirLightColor: '#ffffff',
    dirLightIntensity: 0.5,
    pointLight1Color: '#ffffff',
    pointLight2Color: '#222222',
    starsCount: 0,
  }
}

function DynamicSky({ config }) {
  const starsRef = useRef()
  useFrame((state) => {
    if (starsRef.current) {
      starsRef.current.rotation.y = state.clock.getElapsedTime() * 0.003
      starsRef.current.rotation.x = state.clock.getElapsedTime() * 0.001
    }
  })

  return (
    <>
      {config.starsCount > 0 && (
        <group ref={starsRef}>
          <Stars
            radius={180}
            depth={60}
            count={config.starsCount}
            factor={4}
            saturation={0.5}
            fade
            speed={0.3}
          />
        </group>
      )}
      <Sky sunPosition={config.sunPos} distance={450000} />
    </>
  )
}

function EnvironmentalParticles({ playerPosRef, scenario }) {
  const count = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    return isMobile ? 35 : 120;
  }, []);
  const meshRef = useRef()

  const particles = useMemo(() => {
    const temp = []
    for (let i = 0; i < count; i++) {
      temp.push({
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 40,
        z: (Math.random() - 0.5) * 40,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.4 - 0.15,
        speedZ: (Math.random() - 0.5) * 0.3,
        scale: Math.random() * 0.12 + 0.04
      })
    }
    return temp
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  const color = useMemo(() => {
    if (scenario === 'neon') return new THREE.Color('#ff007f')
    if (scenario === 'fog') return new THREE.Color('#00ffff')
    if (scenario === 'dark') return new THREE.Color('#888888')
    return new THREE.Color('#00ffff')
  }, [scenario])

  useFrame((state, delta) => {
    if (!meshRef.current || !playerPosRef?.current) return
    const px = playerPosRef.current.x
    const py = playerPosRef.current.y
    const pz = playerPosRef.current.z

    particles.forEach((p, i) => {
      p.x += p.speedX * delta * 10
      p.y += p.speedY * delta * 10
      p.z += p.speedZ * delta * 10

      const dx = p.x - px
      const dy = p.y - py
      const dz = p.z - pz

      if (Math.abs(dx) > 20) p.x = px - Math.sign(dx) * 20
      if (Math.abs(dy) > 20) p.y = py - Math.sign(dy) * 20
      if (Math.abs(dz) > 20) p.z = pz - Math.sign(dz) * 20

      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.set(p.scale, p.scale, p.scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </instancedMesh>
  )
}

function Scene({ player1PosRef, player2PosRef }) {
  const phase = useGameStore(s => s.phase)
  const multiplayer = useGameStore(s => s.multiplayer)
  const scenario = useGameStore(s => s.scenario)
  const dirLightRef = useRef()

  const config = useMemo(() => {
    const base = SCENE_CONFIGS[scenario] || SCENE_CONFIGS.default
    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0)
    if (isMobile) {
      return {
        ...base,
        starsCount: Math.min(base.starsCount, 1200)
      }
    }
    return base
  }, [scenario])

  // Dynamic BGM frequency filtering and dynamic shadow light position following
  useFrame(() => {
    const y1 = player1PosRef?.current?.y || 2.5
    const y2 = (multiplayer && player2PosRef?.current) ? player2PosRef.current.y : y1
    const maxPlayerY = Math.max(y1, y2)
    const px = player1PosRef?.current?.x || 0
    const pz = player1PosRef?.current?.z || 0

    if (phase === 'playing') {
      audioSystem.updateMusicIntensity(maxPlayerY - 2.5)
    } else if (phase === 'paused' && audioSystem.filterNode && audioSystem.ctx) {
      // Muffle music on pause
      audioSystem.filterNode.frequency.setTargetAtTime(200, audioSystem.ctx.currentTime, 0.2)
    }

    // Dynamic light tracking to keep shadows active at any height
    if (dirLightRef.current) {
      dirLightRef.current.position.set(px + 15, maxPlayerY + 30, pz + 10)
      dirLightRef.current.target.position.set(px, maxPlayerY, pz)
      dirLightRef.current.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <fog attach="fog" args={[config.fogColor, config.fogNear, config.fogFar]} />

      <DynamicSky config={config} />

      <ambientLight intensity={config.ambientIntensity} color={config.ambientColor} />
      <directionalLight
        ref={dirLightRef}
        position={[15, 30, 10]}
        intensity={config.dirLightIntensity}
        color={config.dirLightColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={250}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <pointLight position={[0, 5, 0]} intensity={3} color={config.pointLight1Color} distance={30} />
      <pointLight position={[0, 0, 0]} intensity={1.5} color={config.pointLight2Color} distance={20} />

      <Physics gravity={[0, -22, 0]} key={phase === 'paused' ? 'playing' : phase} paused={phase === 'paused'}>
        {(phase === 'playing' || phase === 'paused') && (
          <>
            <Player playerId={1} playerPosRef={player1PosRef} />
            {multiplayer && (
              <Player playerId={2} playerPosRef={player2PosRef} />
            )}
          </>
        )}
        <PlatformManager player1PosRef={player1PosRef} player2PosRef={player2PosRef} />
      </Physics>

      {/* Tether Line in local coop */}
      {multiplayer && (phase === 'playing' || phase === 'paused') && (
        <TetherLine p1Ref={player1PosRef} p2Ref={player2PosRef} />
      )}

      <EnvironmentalParticles playerPosRef={player1PosRef} scenario={scenario} />
      {multiplayer && <EnvironmentalParticles playerPosRef={player2PosRef} scenario={scenario} />}

      <JumpDust />
      <LandingRing />

      <Camera player1PosRef={player1PosRef} player2PosRef={player2PosRef} />

      <mesh position={[0, -20, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={config.fogColor} transparent opacity={0.7} />
      </mesh>
    </>
  )
}

export default function App() {
  const player1PosRef = useRef({ x: 0, y: 2.5, z: 0 })
  const player2PosRef = useRef({ x: 0, y: 2.5, z: 0 })

  const phase = useGameStore(s => s.phase)
  const togglePause = useGameStore(s => s.togglePause)
  const checkSession = useGameStore(s => s.checkSession)

  // ── Restaurar sesión al cargar el juego ─────────────────────────────
  useEffect(() => {
    checkSession()
  }, [checkSession])

  // ── Detección de dispositivos táctiles ──────────────────────────────
  useEffect(() => {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
    if (isTouch) {
      document.documentElement.classList.add('is-touch')
    }
  }, [])

  // ── Keyboard Escape Pausing ─────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Escape') {
        if (phase === 'playing' || phase === 'paused') {
          document.activeElement?.blur() // Remove focus from any active buttons
          togglePause()
          audioSystem.playSFX('ui')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, togglePause])

  // ── Procedural Ambient Music States ────────────────────────────────
  useEffect(() => {
    if (phase === 'playing' || phase === 'paused') {
      audioSystem.startMusic()
    } else {
      audioSystem.stopMusic()
    }
  }, [phase])

  const isGameplay = phase === 'playing' || phase === 'paused'
  const activeRoom = useGameStore(s => s.activeRoom)
  const multiplayerMode = useGameStore(s => s.multiplayerMode)

  return (
    <div className={`app-root ${isGameplay ? 'gameplay-active' : ''}`}>
      {!isGameplay && (
        <header className="game-header">
          <div className="header-left">
            <span className="header-logo">⚡ SCALADA</span>
            <span className="header-subtitle">CHALLENGE</span>
          </div>
          <div className="header-right">
            {multiplayerMode === 'online' ? (
              <span className="header-status status-online">🌐 ONLINE ROOM: {activeRoom?.id || '...' }</span>
            ) : multiplayerMode === 'local' ? (
              <span className="header-status status-local">👥 LOCAL CO-OP</span>
            ) : (
              <span className="header-status status-single">👤 SINGLE PLAYER</span>
            )}
          </div>
        </header>
      )}

      <div className="main-layout-wrap">
        {!isGameplay && (
          <div className="ad-container ad-left">
            <GoogleAd slot="left" />
          </div>
        )}

        <div className="game-container">
          <KeyboardControls map={KEYBOARD_MAP}>
            <Canvas
              shadows
              camera={{ position: [0, 10, 15], fov: 60, near: 0.1, far: 1000 }}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              dpr={[1, 2]}
            >
              <Suspense fallback={null}>
                <Scene player1PosRef={player1PosRef} player2PosRef={player2PosRef} />
              </Suspense>
            </Canvas>
          </KeyboardControls>

          <HUD />
          <HeightMilestone />
          <GameOverlay />
          <AuthModal />
          <LeaderboardModal />
          <VirtualJoystick />
          <JumpButton />
        </div>

        {!isGameplay && (
          <div className="ad-container ad-right">
            <GoogleAd slot="right" />
          </div>
        )}
      </div>
      {!isGameplay && (
        <footer className="game-footer">
          <p className="game-footer-text">
            © 2026 Scalada Challenge · Diseñado con estética Premium · 
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="footer-link">Política de Privacidad</a> · 
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="footer-link">Términos de Servicio</a>
          </p>
        </footer>
      )}
    </div>
  )
}
