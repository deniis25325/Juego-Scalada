/**
 * Cross-component communication via module-level state.
 * Provides camera shake and particle event queues without prop drilling.
 */

// ── Camera shake ──────────────────────────────────────────────────────────────
// Camera.jsx reads and decays this each frame
export const cameraShake = { x: 0, y: 0, z: 0 }

export function triggerShake(intensity = 0.35) {
  cameraShake.x = (Math.random() - 0.5) * intensity * 2.2
  cameraShake.y = (Math.random() - 0.5) * intensity * 0.9
  cameraShake.z = (Math.random() - 0.5) * intensity * 2.2
}

// ── Dust particle events ──────────────────────────────────────────────────────
// JumpDust.jsx drains this queue each frame
export const dustQueue = []

export function emitDust(x, y, z, type = 'jump') {
  dustQueue.push({ x, y, z, type })
}

// ── Landing ring events ───────────────────────────────────────────────────────
// LandingRing.jsx drains this queue each frame
export const ringQueue = []

export function emitRing(x, y, z) {
  ringQueue.push({ x, y, z })
}
