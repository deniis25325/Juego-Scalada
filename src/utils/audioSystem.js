class AudioSystem {
  constructor() {
    this.ctx = null
    this.compressor = null
    this.masterGain = null
    this.filterNode = null
    this.isPlayingMusic = false
    this.currentStep = 0
    this.musicTimer = null
    this.baseVolume = 0.18
  }

  init() {
    if (this.ctx) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    this.ctx = new AudioContextClass()

    // Setup main pipeline: Filter -> Compressor -> Master Gain -> Destination
    this.filterNode = this.ctx.createBiquadFilter()
    this.filterNode.type = 'lowpass'
    this.filterNode.frequency.value = 500

    this.compressor = this.ctx.createDynamicsCompressor()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = this.baseVolume

    this.filterNode.connect(this.compressor)
    this.compressor.connect(this.masterGain)
    this.masterGain.connect(this.ctx.destination)
  }

  startMusic() {
    this.init()
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    if (this.isPlayingMusic) return
    this.isPlayingMusic = true
    this.currentStep = 0

    const stepTime = 0.22 // 136 BPM
    let nextNoteTime = this.ctx.currentTime

    const scheduler = () => {
      while (nextNoteTime < this.ctx.currentTime + 0.1) {
        this.playMusicStep(nextNoteTime, this.currentStep)
        nextNoteTime += stepTime
        this.currentStep = (this.currentStep + 1) % 16
      }
      this.musicTimer = setTimeout(scheduler, 25)
    }

    scheduler()
  }

  stopMusic() {
    if (this.musicTimer) clearTimeout(this.musicTimer)
    this.isPlayingMusic = false
  }

  updateMusicIntensity(height) {
    if (!this.filterNode) return
    // Increase low-pass cutoff based on height to make it brighter/intense
    // Height goes from 0 to 150m+
    const cutoff = Math.min(3200, 350 + Math.max(0, height) * 12)
    this.filterNode.frequency.setTargetAtTime(cutoff, this.ctx?.currentTime || 0, 0.5)
  }

  playMusicStep(time, step) {
    if (!this.ctx || this.ctx.state === 'suspended') return

    // Progression: Am, F, C, G (4 steps per chord)
    const chordIndex = Math.floor(step / 4)
    // Roots: A1 (55Hz), F1 (43.6Hz), C2 (65.4Hz), G1 (49Hz)
    const bassFrequencies = [55.00, 43.65, 65.41, 49.00]
    const arpeggioNotes = [
      // Am notes: A3, C4, E4, A4
      [220.00, 261.63, 329.63, 440.00],
      // F notes: F3, A3, C4, F4
      [174.61, 220.00, 261.63, 349.23],
      // C notes: C3, E3, G3, C4
      [130.81, 164.81, 196.00, 261.63],
      // G notes: G3, B3, D4, G4
      [196.00, 246.94, 293.66, 392.00]
    ]

    const rootFreq = bassFrequencies[chordIndex]
    const arpChords = arpeggioNotes[chordIndex]

    // 1. Play Bass Note on beats (even steps)
    if (step % 2 === 0) {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(rootFreq, time)

      // Bass volume envelope
      gain.gain.setValueAtTime(0.24, time)
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.38)

      osc.connect(gain)
      gain.connect(this.filterNode)

      osc.start(time)
      osc.stop(time + 0.4)
    }

    // 2. Play Arpeggiator on every step
    const oscArp = this.ctx.createOscillator()
    const gainArp = this.ctx.createGain()
    oscArp.type = 'sawtooth'

    // Arpeggiate notes in patterns
    const notePattern = [0, 2, 1, 3, 2, 0, 3, 1, 0, 2, 1, 3, 2, 1, 3, 0]
    const noteFreq = arpChords[notePattern[step]]
    oscArp.frequency.setValueAtTime(noteFreq, time)

    // Arp volume envelope
    gainArp.gain.setValueAtTime(0.06, time)
    gainArp.gain.exponentialRampToValueAtTime(0.005, time + 0.18)

    oscArp.connect(gainArp)
    gainArp.connect(this.filterNode)

    oscArp.start(time)
    oscArp.stop(time + 0.2)
  }

  // ── SFX Synthesizers ────────────────────────────────────────────────
  playSFX(type) {
    this.init()
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    const time = this.ctx.currentTime

    switch (type) {
      case 'jump': {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(140, time)
        osc.frequency.exponentialRampToValueAtTime(500, time + 0.12)

        gain.gain.setValueAtTime(0.2, time)
        gain.gain.linearRampToValueAtTime(0.01, time + 0.12)

        osc.connect(gain)
        gain.connect(this.compressor)
        osc.start(time)
        osc.stop(time + 0.13)
        break
      }
      case 'land': {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(160, time)
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.15)

        gain.gain.setValueAtTime(0.35, time)
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.16)

        osc.connect(gain)
        gain.connect(this.compressor)
        osc.start(time)
        osc.stop(time + 0.18)
        break
      }
      case 'fall': {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(350, time)
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.65)

        gain.gain.setValueAtTime(0.3, time)
        gain.gain.linearRampToValueAtTime(0.01, time + 0.65)

        osc.connect(gain)
        gain.connect(this.compressor)
        osc.start(time)
        osc.stop(time + 0.66)
        break
      }
      case 'checkpoint': {
        const notes = [523.25, 659.25, 783.99, 1046.50]
        notes.forEach((freq, idx) => {
          const noteTime = time + idx * 0.08
          const osc = this.ctx.createOscillator()
          const gain = this.ctx.createGain()
          osc.type = 'sine'
          osc.frequency.setValueAtTime(freq, noteTime)

          gain.gain.setValueAtTime(0.18, noteTime)
          gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35)

          osc.connect(gain)
          gain.connect(this.compressor)
          osc.start(noteTime)
          osc.stop(noteTime + 0.38)
        })
        break
      }
      case 'ui': {
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(750, time)

        gain.gain.setValueAtTime(0.12, time)
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.06)

        osc.connect(gain)
        gain.connect(this.compressor)
        osc.start(time)
        osc.stop(time + 0.07)
        break
      }
    }
  }
}

const audioSystem = new AudioSystem()
export default audioSystem
