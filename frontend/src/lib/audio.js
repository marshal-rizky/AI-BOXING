/**
 * audio.js — Web Audio API procedural sound engine.
 *
 * All sounds are synthesised from scratch — no audio files required.
 * AudioContext is created lazily on first call (browser autoplay policy).
 *
 * Sounds:
 *   bellRing()           — boxing bell (start/end of round)
 *   hitImpact(damage)    — punch landing, scaled by damage
 *   whoosh(move)         — swing through air
 *   dodgeSound()         — body sway / slip
 *   crowdReact(intensity)— crowd noise burst
 */

let ctx = null

function _getCtx() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** Connect a chain of nodes and return the last one */
function _chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
  return nodes[nodes.length - 1]
}

// ── Boxing bell ───────────────────────────────────────────────────────────────
export function bellRing() {
  const c   = _getCtx()
  const now = c.currentTime

  // Main tone — triangle wave with decay
  const osc1  = c.createOscillator()
  const gain1 = c.createGain()
  osc1.type = 'triangle'
  osc1.frequency.setValueAtTime(1320, now)
  osc1.frequency.setValueAtTime(880,  now + 0.015)
  osc1.frequency.exponentialRampToValueAtTime(550, now + 0.9)
  gain1.gain.setValueAtTime(0, now)
  gain1.gain.linearRampToValueAtTime(0.85, now + 0.008)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 3.2)
  _chain(osc1, gain1).connect(c.destination)
  osc1.start(now); osc1.stop(now + 3.2)

  // High partial
  const osc2  = c.createOscillator()
  const gain2 = c.createGain()
  osc2.type = 'sine'
  osc2.frequency.value = 2640
  gain2.gain.setValueAtTime(0.28, now)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7)
  _chain(osc2, gain2).connect(c.destination)
  osc2.start(now); osc2.stop(now + 0.7)

  // Low resonant bump
  const osc3  = c.createOscillator()
  const gain3 = c.createGain()
  osc3.type = 'sine'
  osc3.frequency.value = 220
  gain3.gain.setValueAtTime(0.3, now)
  gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  _chain(osc3, gain3).connect(c.destination)
  osc3.start(now); osc3.stop(now + 0.4)
}

// ── Punch impact ──────────────────────────────────────────────────────────────
export function hitImpact(damage = 10, move = 'jab') {
  const c   = _getCtx()
  const now = c.currentTime
  const vol = Math.min(1.2, 0.5 + damage * 0.02)
  const isHook = move === 'hook'
  const isUppercut = move === 'uppercut'

  // Sub-bass thump (punch weight)
  const sub     = c.createOscillator()
  const subGain = c.createGain()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(isUppercut ? 220 : isHook ? 150 : 180, now)
  sub.frequency.exponentialRampToValueAtTime(isUppercut ? 36 : isHook ? 24 : 30, now + (isHook ? 0.22 : 0.18))
  subGain.gain.setValueAtTime(vol * (isHook ? 1.05 : 0.9), now)
  subGain.gain.exponentialRampToValueAtTime(0.001, now + (isHook ? 0.26 : 0.22))
  _chain(sub, subGain).connect(c.destination)
  sub.start(now); sub.stop(now + (isHook ? 0.26 : 0.22))

  // Noise smack (flesh impact)
  const bufLen = Math.floor(c.sampleRate * 0.09)
  const buf    = c.createBuffer(1, bufLen, c.sampleRate)
  const data   = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.8)
  }

  const src      = c.createBufferSource()
  const filt     = c.createBiquadFilter()
  const smackGain = c.createGain()
  src.buffer     = buf
  filt.type      = 'bandpass'
  filt.frequency.value = isUppercut ? 520 + damage * 24 : isHook ? 290 + damage * 16 : 380 + damage * 22
  filt.Q.value   = isHook ? 0.58 : 0.75
  smackGain.gain.setValueAtTime(vol * (isUppercut ? 0.5 : isHook ? 0.68 : 0.55), now)
  smackGain.gain.exponentialRampToValueAtTime(0.001, now + (isHook ? 0.12 : 0.09))
  _chain(src, filt, smackGain).connect(c.destination)
  src.start(now)

  // High transient crack (glove-on-skin)
  if (damage >= 15) {
    const crack     = c.createOscillator()
    const crackGain = c.createGain()
    crack.type = isHook ? 'square' : 'sawtooth'
    crack.frequency.setValueAtTime(isUppercut ? 2200 : isHook ? 900 : 1800, now)
    crack.frequency.exponentialRampToValueAtTime(isHook ? 110 : 200, now + (isHook ? 0.08 : 0.05))
    crackGain.gain.setValueAtTime(vol * (isUppercut ? 0.26 : isHook ? 0.18 : 0.22), now)
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + (isHook ? 0.08 : 0.06))
    _chain(crack, crackGain).connect(c.destination)
    crack.start(now); crack.stop(now + (isHook ? 0.08 : 0.06))
  }

  if (isHook) {
    const slam = c.createOscillator()
    const slamGain = c.createGain()
    slam.type = 'triangle'
    slam.frequency.setValueAtTime(84, now)
    slam.frequency.exponentialRampToValueAtTime(42, now + 0.16)
    slamGain.gain.setValueAtTime(vol * 0.16, now)
    slamGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
    _chain(slam, slamGain).connect(c.destination)
    slam.start(now); slam.stop(now + 0.18)
  }

  if (isUppercut) {
    const rise = c.createOscillator()
    const riseGain = c.createGain()
    rise.type = 'triangle'
    rise.frequency.setValueAtTime(420, now)
    rise.frequency.exponentialRampToValueAtTime(980, now + 0.07)
    riseGain.gain.setValueAtTime(vol * 0.1, now)
    riseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
    _chain(rise, riseGain).connect(c.destination)
    rise.start(now); rise.stop(now + 0.08)
  }
}

// ── Swing whoosh ──────────────────────────────────────────────────────────────
export function whoosh(move = 'jab') {
  const c   = _getCtx()
  const now = c.currentTime
  const dur = move === 'uppercut' ? 0.22 : move === 'hook' ? 0.18 : 0.09

  const osc  = c.createOscillator()
  const filt = c.createBiquadFilter()
  const gain = c.createGain()
  osc.type = move === 'hook' ? 'triangle' : 'sawtooth'
  osc.frequency.setValueAtTime(move === 'uppercut' ? 150 : move === 'hook' ? 240 : 440, now)
  osc.frequency.exponentialRampToValueAtTime(move === 'jab' ? 120 : 60, now + dur)
  filt.type = 'bandpass'
  filt.frequency.value = move === 'uppercut' ? 380 : move === 'hook' ? 460 : 720
  filt.Q.value = move === 'jab' ? 0.9 : 0.55
  gain.gain.setValueAtTime(move === 'jab' ? 0.11 : move === 'hook' ? 0.17 : 0.2, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
  _chain(osc, filt, gain).connect(c.destination)
  osc.start(now); osc.stop(now + dur)
}

// ── Dodge slip ────────────────────────────────────────────────────────────────
export function dodgeSound() {
  const c   = _getCtx()
  const now = c.currentTime
  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(380, now)
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.09)
  gain.gain.setValueAtTime(0.07, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)
  _chain(osc, gain).connect(c.destination)
  osc.start(now); osc.stop(now + 0.1)
}

export function whiffSound(move = 'jab') {
  const c = _getCtx()
  const now = c.currentTime
  const osc = c.createOscillator()
  const filt = c.createBiquadFilter()
  const gain = c.createGain()

  osc.type = 'square'
  osc.frequency.setValueAtTime(move === 'hook' ? 280 : move === 'uppercut' ? 220 : 520, now)
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.08)
  filt.type = 'highpass'
  filt.frequency.value = move === 'jab' ? 900 : 650
  gain.gain.setValueAtTime(0.06, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

  _chain(osc, filt, gain).connect(c.destination)
  osc.start(now); osc.stop(now + 0.09)
}

export function clinchSound() {
  const c = _getCtx()
  const now = c.currentTime
  const osc = c.createOscillator()
  const osc2 = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(120, now)
  osc.frequency.exponentialRampToValueAtTime(70, now + 0.12)
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(180, now)
  osc2.frequency.exponentialRampToValueAtTime(96, now + 0.1)
  gain.gain.setValueAtTime(0.09, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
  osc.connect(gain)
  osc2.connect(gain)
  gain.connect(c.destination)
  osc.start(now); osc.stop(now + 0.14)
  osc2.start(now); osc2.stop(now + 0.12)
}

export function restSound() {
  const c = _getCtx()
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.18)
  gain.gain.setValueAtTime(0.04, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
  _chain(osc, gain).connect(c.destination)
  osc.start(now); osc.stop(now + 0.2)
}

// ── Crowd react ───────────────────────────────────────────────────────────────
export function crowdReact(intensity = 0.5) {
  const c   = _getCtx()
  const now = c.currentTime
  const dur = 0.3 + intensity * 0.6

  const bufLen = Math.floor(c.sampleRate * dur)
  const buf    = c.createBuffer(2, bufLen, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < bufLen; i++) d[i] = Math.random() * 2 - 1
  }
  const src  = c.createBufferSource()
  src.buffer = buf

  const loFilt = c.createBiquadFilter()
  const hiFilt = c.createBiquadFilter()
  loFilt.type = 'lowpass';  loFilt.frequency.value = 800 + intensity * 400
  hiFilt.type = 'highpass'; hiFilt.frequency.value = 120

  const gain = c.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(intensity * 0.12, now + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  _chain(src, loFilt, hiFilt, gain).connect(c.destination)
  src.start(now)
}

// ── Resume context (call on any user interaction) ─────────────────────────────
export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume()
}
