import { gsap } from 'gsap'

const W = 960
const H = 540
const FLOOR_Y = 418
const FIGHTER_SCALE = 1.55

const DIST_POS = [
  [208, 748],
  [284, 672],
  [356, 600],
]

const ATTACKS = ['jab', 'hook', 'uppercut']
const MOVE_COLORS = {
  jab: '#fff4c4',
  hook: '#ff9b5e',
  uppercut: '#ffd84e',
  dodge: '#7bc8ff',
  clinch: '#ff74d0',
  rest: '#c3fff1',
}

const SCENE = {
  reducedMotion: false,
  highlightMode: true,
  lowHealth: { f1: false, f2: false },
}

const S = {
  t: null,
  phase: 'idle',
  phaseAlpha: 0,
  idleT: 0,
  move1: 'idle',
  move2: 'idle',
  dmg1: 0,
  dmg2: 0,
  currentF1X: DIST_POS[1][0],
  currentF2X: DIST_POS[1][1],
  targetF1X: DIST_POS[1][0],
  targetF2X: DIST_POS[1][1],
  cameraX: 0,
  cameraY: 0,
  cameraZoom: 1,
  shake: 0,
  flash: 0,
  backdropPulse: 0,
  vignette: 0.32,
  haze: 0.18,
  speedLines: 0,
  superFlash: 0,
  clash: 0,
  dangerPulse: 0,
  f1Flash: 0,
  f2Flash: 0,
  f1Trail: 0,
  f2Trail: 0,
  impactGlow: 0,
  impactMove: null,
  f1Whiff: false,
  f2Whiff: false,
  clinchLock: 0,
  f1GuardBreak: 0,
  f2GuardBreak: 0,
  f1HitMove: null,
  f2HitMove: null,
}

let canvas = null
let ctx = null
let onImpactCb = null

let particles = []
let sparks = []
let dust = []
let slashBursts = []
let shockRings = []
let damageTexts = []
let combatTexts = []
let animationTl = null

export function setSceneOptions(options) {
  Object.assign(SCENE, options)
}

export function init(canvasEl, onImpact) {
  canvas = canvasEl
  canvas.width = W
  canvas.height = H
  ctx = canvas.getContext('2d')
  onImpactCb = onImpact

  gsap.ticker.fps(60)
  gsap.ticker.add(masterTick)
}

export function destroy() {
  gsap.ticker.remove(masterTick)
  gsap.killTweensOf(S)
  animationTl?.kill()
}

export function setDistance(level) {
  const pos = DIST_POS[Math.max(0, Math.min(2, level))] || DIST_POS[1]
  S.targetF1X = pos[0]
  S.targetF2X = pos[1]
}

export function drawIdle() {
  animationTl?.kill()
  gsap.killTweensOf(S)
  particles = []
  sparks = []
  dust = []
  slashBursts = []
  shockRings = []
  damageTexts = []
  combatTexts = []

  Object.assign(S, {
    t: null,
    phase: 'idle',
    phaseAlpha: 0,
    move1: 'idle',
    move2: 'idle',
    dmg1: 0,
    dmg2: 0,
    flash: 0,
    backdropPulse: 0,
    superFlash: 0,
    speedLines: 0,
    clash: 0,
    f1Flash: 0,
    f2Flash: 0,
    f1Trail: 0,
    f2Trail: 0,
    impactGlow: 0,
    impactMove: null,
    f1Whiff: false,
    f2Whiff: false,
    clinchLock: 0,
    f1GuardBreak: 0,
    f2GuardBreak: 0,
    shake: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    currentF1X: DIST_POS[1][0],
    currentF2X: DIST_POS[1][1],
    targetF1X: DIST_POS[1][0],
    targetF2X: DIST_POS[1][1],
    f1HitMove: null,
    f2HitMove: null,
  })
}

export function getRoundProfile({ move1, move2, dmgToF1, dmgToF2, reducedMotion = false, highlightMode = true }) {
  const maxDamage = Math.max(dmgToF1 || 0, dmgToF2 || 0)
  const attackCount = [move1, move2].filter(move => ATTACKS.includes(move)).length
  const defensiveExchange = [move1, move2].includes('dodge') || [move1, move2].includes('clinch')
  const evasiveExchange = move1 === 'dodge' || move2 === 'dodge'
  const clinchExchange = move1 === 'clinch' || move2 === 'clinch'
  const restExchange = move1 === 'rest' || move2 === 'rest'
  const heavy = maxDamage >= 20
  const slowFactor = reducedMotion ? 0.9 : 1
  const highlightFactor = highlightMode ? 1.18 : 0.96

  const introMs = 80 * slowFactor
  const approachMs = (clinchExchange ? 155 : evasiveExchange ? 110 : 90) * highlightFactor
  const anticipationMs = (heavy ? 180 : restExchange ? 110 : 130 + attackCount * 18) * highlightFactor
  const strikeMs = (heavy ? 110 : move1 === 'jab' || move2 === 'jab' ? 72 : move1 === 'hook' || move2 === 'hook' ? 105 : 90) * slowFactor
  const hitstopMs = reducedMotion ? Math.min(80, 30 + maxDamage * 2) : Math.min(160, 38 + maxDamage * 3.2)
  const recoveryMs = (heavy ? 240 : clinchExchange ? 228 : evasiveExchange ? 185 : restExchange ? 210 : 170) * highlightFactor
  const repositionMs = clinchExchange ? 230 : defensiveExchange ? 210 : restExchange ? 120 : 160
  const totalMs = introMs + approachMs + anticipationMs + strikeMs + hitstopMs + recoveryMs + repositionMs
  const recommendedDelay = Math.round(totalMs + (heavy ? 340 : defensiveExchange ? 220 : 160))

  return {
    introMs: Math.round(introMs),
    approachMs: Math.round(approachMs),
    anticipationMs: Math.round(anticipationMs),
    strikeMs: Math.round(strikeMs),
    hitstopMs: Math.round(hitstopMs),
    recoveryMs: Math.round(recoveryMs),
    repositionMs: Math.round(repositionMs),
    totalMs: Math.round(totalMs),
    recommendedDelay,
    maxDamage,
    heavy,
  }
}

export function animateRound(move1, move2, dmgToF1, dmgToF2, distBefore, distAfter, options = {}) {
  animationTl?.kill()
  gsap.killTweensOf(S)
  particles = []
  sparks = []
  dust = []
  slashBursts = []
  shockRings = []
  damageTexts = []
  combatTexts = []

  const reducedMotion = !!options.reducedMotion
  const highlightMode = options.highlightMode !== false
  const profile = options.profile || getRoundProfile({ move1, move2, dmgToF1, dmgToF2, reducedMotion, highlightMode })
  const posBefore = DIST_POS[distBefore] || DIST_POS[1]
  const posAfter = DIST_POS[distAfter] || DIST_POS[1]
  const maxDamage = Math.max(dmgToF1 || 0, dmgToF2 || 0)
  const dominantMove = dmgToF1 > dmgToF2 ? move2 : move1
  const clinchExchange = move1 === 'clinch' || move2 === 'clinch'
  const counterByF1 = (dmgToF2 || 0) > 0 && ATTACKS.includes(move2) && !ATTACKS.includes(move1)
  const counterByF2 = (dmgToF1 || 0) > 0 && ATTACKS.includes(move1) && !ATTACKS.includes(move2)
  const isCounter = counterByF1 || counterByF2
  const finisherLabel = dominantMove === 'uppercut' && maxDamage >= 20 ? 'UPPERCUT FINISH' : maxDamage >= 20 ? 'KNOCKOUT IMPACT' : 'FIGHT OVER'

  Object.assign(S, {
    t: 0,
    phase: 'intro',
    phaseAlpha: 0,
    move1,
    move2,
    dmg1: dmgToF1 || 0,
    dmg2: dmgToF2 || 0,
    flash: 0,
    backdropPulse: 0,
    superFlash: 0,
    speedLines: 0,
    clash: move1 === move2 && ATTACKS.includes(move1) ? 0.6 : 0,
    shake: 0,
    cameraX: 0,
    cameraY: 0,
    cameraZoom: 1,
    impactGlow: 0,
    impactMove: dominantMove,
    f1Whiff: ATTACKS.includes(move1) && (dmgToF2 || 0) <= 0,
    f2Whiff: ATTACKS.includes(move2) && (dmgToF1 || 0) <= 0,
    clinchLock: 0,
    f1GuardBreak: 0,
    f2GuardBreak: 0,
    f1Flash: 0,
    f2Flash: 0,
    f1Trail: 0,
    f2Trail: 0,
    currentF1X: posBefore[0],
    currentF2X: posBefore[1],
    targetF1X: posAfter[0],
    targetF2X: posAfter[1],
    f1HitMove: null,
    f2HitMove: null,
  })

  const emitPhase = phase => {
    S.phase = phase
    S.phaseAlpha = 0
    options.onPhaseChange?.(phase)
  }

  animationTl = gsap.timeline({
    defaults: { ease: 'none' },
    onComplete() {
      S.t = null
      S.phase = 'idle'
      S.phaseAlpha = 0
      S.currentF1X = S.targetF1X
      S.currentF2X = S.targetF2X
      options.onComplete?.({
        recommendedDelay: profile.recommendedDelay,
        totalMs: profile.totalMs,
        maxDamage,
        finisherLabel,
        dominantMove,
        isCounter,
      })
    },
  })

  animationTl
    .call(() => emitPhase('intro'))
    .to(S, { phaseAlpha: 1, duration: profile.introMs / 1000, ease: 'power1.out' })
    .call(() => emitPhase('approach'))
    .to(S, { phaseAlpha: 1, duration: profile.approachMs / 1000, ease: 'power2.inOut' })
    .call(() => {
      emitPhase('anticipation')
      if (clinchExchange) {
        gsap.to(S, {
          clinchLock: 1,
          duration: Math.max(0.12, profile.anticipationMs / 1000),
          ease: 'power2.out',
          overwrite: 'auto',
        })
      }
      gsap.to(S, {
        speedLines: 0.4,
        duration: reducedMotion ? 0.08 : 0.14,
        yoyo: true,
        repeat: 1,
        overwrite: 'auto',
      })
      gsap.to(S, {
        cameraZoom: highlightMode ? 1.035 : 1.02,
        duration: profile.anticipationMs / 1000,
        ease: 'power2.out',
        overwrite: 'auto',
      })
    })
    .to(S, { phaseAlpha: 1, duration: profile.anticipationMs / 1000, ease: 'power2.out' })
    .call(() => {
      emitPhase('strike')
      spawnMoveAura(move1, S.currentF1X + 44, FLOOR_Y - 150, false, 1)
      spawnMoveAura(move2, S.currentF2X - 44, FLOOR_Y - 150, true, 1)
      if (S.f1Whiff) spawnWhiffFx(S.currentF1X + 78, FLOOR_Y - 154, move1, false)
      if (S.f2Whiff) spawnWhiffFx(S.currentF2X - 78, FLOOR_Y - 154, move2, true)
      if (S.clinchLock > 0) spawnClinchFx((S.currentF1X + S.currentF2X) / 2, FLOOR_Y - 142)
    })
    .to(S, {
      t: 0.32,
      phaseAlpha: 1,
      duration: profile.strikeMs / 1000,
      ease: 'power3.out',
    })
    .call(() => {
      emitPhase('impact')
      applyImpactProfile(
        maxDamage,
        move1,
        move2,
        dmgToF1,
        dmgToF2,
        reducedMotion,
        isCounter,
        counterByF1 ? 'f1' : counterByF2 ? 'f2' : null
      )
      options.onImpact?.({
        intensity: maxDamage,
        move: dominantMove,
        fighter: dmgToF1 > dmgToF2 ? 'f2' : 'f1',
        maxDamage,
        isCounter,
        counterBy: counterByF1 ? 'f1' : counterByF2 ? 'f2' : null,
        isUppercut: dominantMove === 'uppercut',
        isHook: dominantMove === 'hook',
      })
      onImpactCb?.({ maxDamage, move1, move2 })
    })
    .to({}, { duration: profile.hitstopMs / 1000 })
    .call(() => emitPhase('recovery'))
    .to(S, {
      t: 0.74,
      phaseAlpha: 1,
      duration: profile.recoveryMs / 1000,
      ease: 'power2.inOut',
    })
    .call(() => emitPhase('reposition'))
    .to(S, {
      t: 1,
      phaseAlpha: 1,
      cameraZoom: 1,
      cameraX: 0,
      cameraY: 0,
      clinchLock: 0,
      duration: profile.repositionMs / 1000,
      ease: 'power2.out',
    })
}

function applyImpactProfile(maxDamage, move1, move2, dmgToF1, dmgToF2, reducedMotion, isCounter = false, counterBy = null) {
  if (dmgToF1 > 0) S.f1HitMove = move2
  if (dmgToF2 > 0) S.f2HitMove = move1

  const heavy = maxDamage >= 20
  const flashStrength = heavy ? 0.9 : maxDamage > 0 ? 0.5 : 0.18
  const dominantMove = dmgToF1 > dmgToF2 ? move2 : move1
  const shakeStrength = reducedMotion ? maxDamage * 0.08 : dominantMove === 'hook' ? maxDamage * 0.62 : heavy ? maxDamage * 0.5 : maxDamage * 0.28
  const zoomStrength = reducedMotion ? 1.015 : dominantMove === 'uppercut' ? 1.1 : heavy ? 1.08 : dominantMove === 'hook' ? 1.06 : 1.04
  const guardBreakStrength = heavy && (dominantMove === 'hook' || dominantMove === 'uppercut') ? 1 : 0

  S.flash = flashStrength
  S.backdropPulse = dominantMove === 'uppercut' ? 1 : dominantMove === 'hook' ? (heavy ? 0.94 : 0.58) : heavy ? 0.85 : 0.45
  S.superFlash = heavy ? 1 : 0
  S.impactGlow = dominantMove === 'uppercut' ? 1.15 : dominantMove === 'hook' ? 1.08 : heavy ? 1 : 0.62
  S.shake = shakeStrength
  S.cameraZoom = zoomStrength
  S.cameraY = dominantMove === 'uppercut' ? -28 : heavy ? -8 : -4
  S.cameraX = dominantMove === 'hook' ? (dmgToF1 > dmgToF2 ? -26 : 26) : dominantMove === 'jab' ? (dmgToF1 > dmgToF2 ? -4 : 4) : 0
  S.speedLines = dominantMove === 'uppercut' ? 0.55 : S.speedLines
  S.f1Flash = dmgToF1 > 0 ? 1 : 0
  S.f2Flash = dmgToF2 > 0 ? 1 : 0
  S.f1GuardBreak = dmgToF1 > 0 ? guardBreakStrength : 0
  S.f2GuardBreak = dmgToF2 > 0 ? guardBreakStrength : 0
  S.f1Trail = move1 === 'hook' ? 1.2 : move1 === 'uppercut' ? 1.05 : ATTACKS.includes(move1) ? 0.9 : move1 === 'dodge' ? 0.5 : 0.25
  S.f2Trail = move2 === 'hook' ? 1.2 : move2 === 'uppercut' ? 1.05 : ATTACKS.includes(move2) ? 0.9 : move2 === 'dodge' ? 0.5 : 0.25

  gsap.to(S, { flash: 0, duration: heavy ? 0.4 : 0.22, overwrite: 'auto' })
  gsap.to(S, { backdropPulse: 0, duration: heavy ? 0.9 : 0.5, overwrite: 'auto' })
  gsap.to(S, { superFlash: 0, duration: 0.35, overwrite: 'auto' })
  gsap.to(S, { impactGlow: 0, duration: 0.48, overwrite: 'auto' })
  gsap.to(S, { speedLines: 0, duration: 0.32, overwrite: 'auto' })
  gsap.to(S, { shake: 0, duration: heavy ? 0.45 : 0.28, ease: 'power2.out', overwrite: 'auto' })
  gsap.to(S, { cameraZoom: 1, duration: heavy ? 0.62 : 0.36, ease: 'power2.out', overwrite: 'auto' })
  gsap.to(S, { cameraY: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' })
  gsap.to(S, { cameraX: 0, duration: dominantMove === 'hook' ? 0.4 : 0.32, ease: 'power2.out', overwrite: 'auto' })
  gsap.to(S, { f1Flash: 0, duration: 0.15, delay: 0.06, overwrite: 'auto' })
  gsap.to(S, { f2Flash: 0, duration: 0.15, delay: 0.06, overwrite: 'auto' })
  gsap.to(S, { f1GuardBreak: 0, duration: heavy ? 0.42 : 0.22, overwrite: 'auto' })
  gsap.to(S, { f2GuardBreak: 0, duration: heavy ? 0.42 : 0.22, overwrite: 'auto' })
  gsap.to(S, { f1Trail: 0, duration: 0.24, overwrite: 'auto' })
  gsap.to(S, { f2Trail: 0, duration: 0.24, overwrite: 'auto' })

  spawnImpactFx(maxDamage, dmgToF1, dmgToF2, isCounter, counterBy)
}

function masterTick(_, deltaTime) {
  const norm = deltaTime / 16.67
  S.idleT += deltaTime * 0.001
  S.dangerPulse += deltaTime * 0.0025

  if (S.t === null) {
    S.currentF1X += (S.targetF1X - S.currentF1X) * 0.18
    S.currentF2X += (S.targetF2X - S.currentF2X) * 0.18
  }

  particles.forEach(p => {
    p.x += p.vx * norm
    p.y += p.vy * norm
    p.vy += 0.18 * norm
    p.life -= norm
  })
  sparks.forEach(s => {
    s.x += s.vx * norm
    s.y += s.vy * norm
    s.life -= norm
  })
  dust.forEach(d => {
    d.x += d.vx * norm
    d.y += d.vy * norm
    d.life -= norm
  })
  slashBursts.forEach(b => {
    b.life -= norm
    b.radius += b.growth * norm
  })
  shockRings.forEach(r => {
    r.life -= norm
    r.radius += r.growth * norm
  })
  damageTexts.forEach(t => {
    t.x += t.vx * norm
    t.y += t.vy * norm
    t.life -= norm
  })
  combatTexts.forEach(t => {
    t.x += t.vx * norm
    t.y += t.vy * norm
    t.life -= norm
  })

  particles = particles.filter(p => p.life > 0)
  sparks = sparks.filter(s => s.life > 0)
  dust = dust.filter(d => d.life > 0)
  slashBursts = slashBursts.filter(b => b.life > 0)
  shockRings = shockRings.filter(r => r.life > 0)
  damageTexts = damageTexts.filter(t => t.life > 0)
  combatTexts = combatTexts.filter(t => t.life > 0)

  drawScene()
}

function drawScene() {
  if (!ctx) return

  ctx.save()
  ctx.clearRect(0, 0, W, H)

  const driftX = Math.sin(S.idleT * 0.7) * 4
  const driftY = Math.cos(S.idleT * 0.9) * 3
  const shakeX = S.shake > 0.5 ? (Math.random() - 0.5) * S.shake : 0
  const shakeY = S.shake > 0.5 ? (Math.random() - 0.5) * S.shake * 0.45 : 0

  ctx.translate(W / 2 + driftX + S.cameraX + shakeX, H / 2 + driftY + S.cameraY + shakeY)
  ctx.scale(S.cameraZoom, S.cameraZoom)
  ctx.translate(-W / 2, -H / 2)

  drawBackground()
  drawArenaGlow()
  drawCrowd()
  drawRing()
  drawAmbientFx()

  const offsets = computeOffsets()
  const f1X = S.currentF1X + offsets.lunge1 + offsets.stagger1
  const f2X = S.currentF2X + offsets.lunge2 + offsets.stagger2

  if (S.f1Trail > 0.05) {
    drawFighter(f1X - 18, FLOOR_Y, '#ffb0b0', '#ffd9d9', S.move1, Math.max(0, (S.t ?? 0) - 0.06), false, null, true, S.f1Trail * 0.22)
  }
  if (S.f2Trail > 0.05) {
    drawFighter(f2X + 18, FLOOR_Y, '#bddcff', '#e5f4ff', S.move2, Math.max(0, (S.t ?? 0) - 0.06), true, null, true, S.f2Trail * 0.22)
  }

  drawFighter(f1X, FLOOR_Y, '#ec5454', '#8f2727', S.move1, S.t ?? 0, false, S.f1HitMove, S.f1Flash > 0.08, 1)
  drawFighter(f2X, FLOOR_Y, '#4ba3ff', '#284d96', S.move2, S.t ?? 0, true, S.f2HitMove, S.f2Flash > 0.08, 1)

  drawFrontFx()

  if (S.flash > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${S.flash * 0.7})`
    ctx.fillRect(0, 0, W, H)
  }

  if (S.superFlash > 0.02) {
    ctx.fillStyle = `rgba(255,76,52,${S.superFlash * 0.2})`
    ctx.fillRect(0, 0, W, H)
  }

  drawVignette()
  ctx.restore()
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#120e1f')
  g.addColorStop(0.45, '#10071d')
  g.addColorStop(1, '#05040c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  const burst = ctx.createRadialGradient(W / 2, 160, 20, W / 2, 220, 420)
  burst.addColorStop(0, `rgba(255,180,88,${0.24 + S.backdropPulse * 0.18})`)
  burst.addColorStop(0.45, `rgba(255,78,60,${0.08 + S.backdropPulse * 0.08})`)
  burst.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = burst
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.globalAlpha = 0.14 + S.haze
  for (let i = 0; i < 14; i++) {
    const width = 140 + i * 34
    const x = (i * 93 + Math.sin(S.idleT + i) * 28) % (W + width) - width / 2
    const y = 60 + i * 16
    const grad = ctx.createLinearGradient(x, y, x + width, y + 40)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.16)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, width, 26)
  }
  ctx.restore()
}

function drawArenaGlow() {
  ctx.save()
  const alpha = 0.14 + S.impactGlow * 0.2
  const glow = ctx.createRadialGradient(W / 2, FLOOR_Y - 10, 40, W / 2, FLOOR_Y - 10, 320)
  glow.addColorStop(0, `rgba(255,174,58,${alpha})`)
  glow.addColorStop(0.4, `rgba(255,54,54,${alpha * 0.44})`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, FLOOR_Y - 200, W, 260)
  ctx.restore()
}

function drawCrowd() {
  ctx.save()
  ctx.beginPath()
  ctx.rect(48, 54, W - 96, 118)
  ctx.clip()

  for (let i = 0; i < 120; i++) {
    const px = 60 + (i / 120) * (W - 120) + Math.sin(i * 1.9 + S.idleT) * 8
    const row = i % 5
    const py = 60 + row * 23 + Math.cos(i * 1.3 + S.idleT * 2.2) * 3
    const size = 7 + (row % 2) * 2
    const lum = 18 + (Math.sin(i * 0.9) + 1) * 16
    ctx.beginPath()
    ctx.ellipse(px, py, size, size * 1.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${lum + 25},${lum + 12},${lum + 44},0.42)`
    ctx.fill()
  }

  const fade = ctx.createLinearGradient(0, 54, 0, 180)
  fade.addColorStop(0, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(8,6,14,0.92)')
  ctx.fillStyle = fade
  ctx.fillRect(48, 54, W - 96, 126)
  ctx.restore()
}

function drawRing() {
  const rx = 62
  const ry = FLOOR_Y + 8
  const rw = W - 124
  const rh = H - ry - 14

  const mat = ctx.createLinearGradient(0, ry, 0, H)
  mat.addColorStop(0, '#241635')
  mat.addColorStop(0.5, '#1b102b')
  mat.addColorStop(1, '#0c0914')
  ctx.fillStyle = mat
  ctx.fillRect(rx, ry, rw, rh)

  ctx.save()
  ctx.globalAlpha = 0.22
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
    ctx.fillRect(rx + i * (rw / 12), ry, rw / 24, rh)
  }
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(255,194,96,0.08)'
  ctx.beginPath()
  ctx.ellipse(W / 2, FLOOR_Y + 40, 210, 36, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  for (let i = 0; i < 3; i++) {
    const y = ry - 76 + i * 24
    ctx.beginPath()
    ctx.strokeStyle = i === 1 ? 'rgba(255,102,102,0.86)' : 'rgba(161,44,44,0.72)'
    ctx.lineWidth = 6 - i
    ctx.moveTo(rx, y)
    ctx.lineTo(rx + rw, y)
    ctx.stroke()
  }

  ;[rx, rx + rw].forEach(x => {
    const post = ctx.createLinearGradient(x - 10, 0, x + 10, 0)
    post.addColorStop(0, '#383838')
    post.addColorStop(0.5, '#d4b067')
    post.addColorStop(1, '#3f3f3f')
    ctx.fillStyle = post
    ctx.fillRect(x - 10, ry - 98, 20, rh + 98)
  })

  ctx.strokeStyle = 'rgba(232,184,75,0.65)'
  ctx.lineWidth = 3
  ctx.strokeRect(rx, ry, rw, rh)
}

function drawAmbientFx() {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'

  particles.forEach(p => {
    const alpha = p.life / p.maxLife
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2)
    ctx.fillStyle = hexA(p.color, alpha * 0.8)
    ctx.fill()
  })

  sparks.forEach(s => {
    const alpha = s.life / s.maxLife
    ctx.lineCap = 'round'
    ctx.strokeStyle = hexA(s.color, alpha)
    ctx.lineWidth = 4 * alpha
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(s.x - s.vx * 1.4, s.y - s.vy * 1.4)
    ctx.stroke()

    ctx.strokeStyle = hexA('#ffffff', alpha * 0.8)
    ctx.lineWidth = 1.8 * alpha
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(s.x - s.vx * 0.9, s.y - s.vy * 0.9)
    ctx.stroke()
  })

  dust.forEach(d => {
    const alpha = d.life / d.maxLife
    ctx.beginPath()
    ctx.ellipse(d.x, d.y, d.rx * alpha, d.ry * alpha, 0, 0, Math.PI * 2)
    ctx.fillStyle = hexA('#e7c08c', alpha * 0.25)
    ctx.fill()
  })

  shockRings.forEach(r => {
    const alpha = r.life / r.maxLife
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
    ctx.strokeStyle = hexA(r.color, alpha * 0.8)
    ctx.lineWidth = (r.thickness || 5) * alpha
    ctx.stroke()
  })

  slashBursts.forEach(b => {
    const alpha = b.life / b.maxLife
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.angle)
    ctx.fillStyle = hexA(b.color, alpha * 0.28)
    if (b.kind === 'jab') {
      ctx.fillRect(-b.radius, -3, b.radius * 2, 6)
      ctx.fillStyle = hexA('#ffffff', alpha * 0.42)
      ctx.fillRect(-b.radius * 0.45, -1.5, b.radius * 0.9, 3)
    } else if (b.kind === 'hook') {
      ctx.beginPath()
      ctx.arc(0, 0, b.radius, -0.32, 0.32)
      ctx.arc(0, 0, Math.max(16, b.radius - 18), 0.24, -0.24, true)
      ctx.closePath()
      ctx.fill()
    } else if (b.kind === 'uppercut') {
      ctx.beginPath()
      ctx.moveTo(-10, b.radius * 0.2)
      ctx.lineTo(0, -b.radius)
      ctx.lineTo(10, b.radius * 0.2)
      ctx.lineTo(0, b.radius * 0.45)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(-b.radius, -8)
      ctx.lineTo(b.radius, 0)
      ctx.lineTo(-b.radius, 8)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  })

  damageTexts.forEach(t => {
    const alpha = t.life / t.maxLife
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(t.x, t.y)
    ctx.scale(t.scale, t.scale)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${t.size}px "Bebas Neue", sans-serif`
    ctx.lineWidth = 6
    ctx.strokeStyle = `rgba(8,8,12,${alpha * 0.8})`
    ctx.strokeText(t.text, 0, 0)
    ctx.fillStyle = hexA(t.color, Math.min(1, alpha * 1.2))
    ctx.fillText(t.text, 0, 0)
    if (t.glow) {
      ctx.shadowBlur = 16
      ctx.shadowColor = hexA(t.color, alpha * 0.6)
      ctx.fillText(t.text, 0, 0)
    }
    ctx.restore()
  })

  combatTexts.forEach(t => {
    const alpha = t.life / t.maxLife
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(t.x, t.y)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${t.size}px "Bebas Neue", sans-serif`
    ctx.lineWidth = 5
    ctx.strokeStyle = `rgba(8,8,12,${alpha * 0.82})`
    ctx.strokeText(t.text, 0, 0)
    ctx.fillStyle = hexA(t.color, alpha)
    ctx.shadowBlur = 14
    ctx.shadowColor = hexA(t.color, alpha * 0.5)
    ctx.fillText(t.text, 0, 0)
    ctx.restore()
  })

  ctx.restore()
}

function drawFrontFx() {
  if (S.impactMove === 'uppercut' && S.superFlash > 0.06) {
    ctx.save()
    ctx.globalAlpha = S.superFlash * 0.34
    const leftGrad = ctx.createLinearGradient(0, 0, 160, 0)
    leftGrad.addColorStop(0, 'rgba(255,244,186,0.95)')
    leftGrad.addColorStop(0.55, 'rgba(255,214,78,0.35)')
    leftGrad.addColorStop(1, 'rgba(255,214,78,0)')
    ctx.fillStyle = leftGrad
    ctx.fillRect(0, 0, 160, H)

    const rightGrad = ctx.createLinearGradient(W, 0, W - 160, 0)
    rightGrad.addColorStop(0, 'rgba(255,244,186,0.95)')
    rightGrad.addColorStop(0.55, 'rgba(255,214,78,0.35)')
    rightGrad.addColorStop(1, 'rgba(255,214,78,0)')
    ctx.fillStyle = rightGrad
    ctx.fillRect(W - 160, 0, 160, H)
    ctx.restore()
  }

  if (S.impactMove === 'uppercut' && S.speedLines > 0.02) {
    ctx.save()
    ctx.globalAlpha = S.speedLines * 0.28
    for (let i = 0; i < 8; i++) {
      const x = 220 + i * 72
      const grad = ctx.createLinearGradient(x, H, x, 100)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.45, 'rgba(255,216,78,0.75)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x, 100, 10, H - 120)
    }
    ctx.restore()
  }

  if (S.clinchLock > 0.2) {
    ctx.save()
    ctx.globalAlpha = 0.16 + S.clinchLock * 0.1
    ctx.strokeStyle = MOVE_COLORS.clinch
    ctx.lineWidth = 6
    const midX = (S.currentF1X + S.currentF2X) / 2
    ctx.beginPath()
    ctx.arc(midX, FLOOR_Y - 142, 30, 0.2, Math.PI - 0.2)
    ctx.stroke()
    ctx.globalAlpha = 0.1 + S.clinchLock * 0.14
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(midX - 32, FLOOR_Y - 174)
    ctx.lineTo(midX + 32, FLOOR_Y - 116)
    ctx.moveTo(midX - 32, FLOOR_Y - 116)
    ctx.lineTo(midX + 32, FLOOR_Y - 174)
    ctx.stroke()
    ctx.globalAlpha = 0.08 + S.clinchLock * 0.16
    const crushGrad = ctx.createRadialGradient(midX, FLOOR_Y - 142, 10, midX, FLOOR_Y - 142, 72)
    crushGrad.addColorStop(0, 'rgba(255,174,228,0.9)')
    crushGrad.addColorStop(0.55, 'rgba(255,116,208,0.25)')
    crushGrad.addColorStop(1, 'rgba(255,116,208,0)')
    ctx.fillStyle = crushGrad
    ctx.beginPath()
    ctx.ellipse(midX, FLOOR_Y - 142, 64, 34, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  if (S.impactMove === 'hook' && S.backdropPulse > 0.06) {
    ctx.save()
    ctx.globalAlpha = S.backdropPulse * 0.22
    const hookSide = S.cameraX >= 0 ? 1 : -1
    const startX = hookSide > 0 ? W * 0.36 : W * 0.04
    const endX = hookSide > 0 ? W * 0.96 : W * 0.64
    const grad = ctx.createLinearGradient(startX, 0, endX, 0)
    grad.addColorStop(0, 'rgba(255,155,94,0)')
    grad.addColorStop(0.35, 'rgba(255,155,94,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(Math.min(startX, endX), 110, Math.abs(endX - startX), H - 200)
    ctx.restore()
  }

  if (S.speedLines > 0.02) {
    ctx.save()
    ctx.globalAlpha = S.speedLines * 0.35
    for (let i = 0; i < 10; i++) {
      const y = 120 + i * 28
      const grad = ctx.createLinearGradient(0, y, W, y)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(0.45, 'rgba(255,255,255,0.65)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(40, y, W - 80, 4)
    }
    ctx.restore()
  }
}

function drawVignette() {
  const pulse = Math.sin(S.dangerPulse) * 0.5 + 0.5
  const leftDanger = SCENE.lowHealth?.f1 ? 0.12 + pulse * 0.08 : 0
  const rightDanger = SCENE.lowHealth?.f2 ? 0.12 + pulse * 0.08 : 0

  const base = ctx.createRadialGradient(W / 2, H / 2, 180, W / 2, H / 2, 520)
  base.addColorStop(0, 'rgba(0,0,0,0)')
  base.addColorStop(1, `rgba(0,0,0,${S.vignette + S.backdropPulse * 0.15})`)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)

  if (leftDanger > 0) {
    const grad = ctx.createLinearGradient(0, 0, 220, 0)
    grad.addColorStop(0, `rgba(255,56,56,${leftDanger})`)
    grad.addColorStop(1, 'rgba(255,56,56,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 220, H)
  }

  if (rightDanger > 0) {
    const grad = ctx.createLinearGradient(W, 0, W - 220, 0)
    grad.addColorStop(0, `rgba(56,130,255,${rightDanger})`)
    grad.addColorStop(1, 'rgba(56,130,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(W - 220, 0, 220, H)
  }
}

function spawnImpactFx(maxDamage, dmgToF1, dmgToF2, isCounter = false, counterBy = null) {
  const gap = S.currentF2X - S.currentF1X
  const impactY = FLOOR_Y - 182

  if (dmgToF2 > 0) {
    const x = S.currentF1X + Math.min(gap * 0.56, 150)
    spawnBurstAt(x, impactY, '#ff8956', maxDamage, S.f2HitMove)
    spawnDamageText(x + 10, impactY - 26, dmgToF2, S.f2HitMove, false)
    if (isCounter && counterBy === 'f1') spawnCombatText(x + 4, impactY - 62, 'COUNTER', '#ff6f52', 24, false)
    if (dmgToF2 >= 20) spawnCombatText(x + 18, impactY - 88, 'CRITICAL', S.f2HitMove === 'uppercut' ? '#ffd84e' : '#ff8f64', 22, false)
    if (dmgToF2 >= 20 && (S.f2HitMove === 'hook' || S.f2HitMove === 'uppercut')) {
      spawnCombatText(x - 10, impactY - 110, 'GUARD BREAK', '#fff1b8', 18, false)
    }
  }
  if (dmgToF1 > 0) {
    const x = S.currentF2X - Math.min(gap * 0.56, 150)
    spawnBurstAt(x, impactY, '#6eb4ff', maxDamage, S.f1HitMove)
    spawnDamageText(x - 10, impactY - 26, dmgToF1, S.f1HitMove, true)
    if (isCounter && counterBy === 'f2') spawnCombatText(x - 4, impactY - 62, 'COUNTER', '#ff6f52', 24, true)
    if (dmgToF1 >= 20) spawnCombatText(x - 18, impactY - 88, 'CRITICAL', S.f1HitMove === 'uppercut' ? '#ffd84e' : '#8fd0ff', 22, true)
    if (dmgToF1 >= 20 && (S.f1HitMove === 'hook' || S.f1HitMove === 'uppercut')) {
      spawnCombatText(x + 10, impactY - 110, 'GUARD BREAK', '#fff1b8', 18, true)
    }
  }

  if (dmgToF1 === 0 && dmgToF2 === 0) {
    const x = (S.currentF1X + S.currentF2X) / 2
    spawnBurstAt(x, impactY, '#ffe07b', 8, null)
  }

  const dustY = FLOOR_Y + 6
  for (let i = 0; i < 7; i++) {
    dust.push({
      x: S.currentF1X + 36 + Math.random() * 22,
      y: dustY + Math.random() * 4,
      vx: -0.4 - Math.random() * 0.6,
      vy: -0.05 - Math.random() * 0.08,
      rx: 34 + Math.random() * 22,
      ry: 10 + Math.random() * 6,
      life: 14 + Math.random() * 10,
      maxLife: 24,
    })
    dust.push({
      x: S.currentF2X - 36 - Math.random() * 22,
      y: dustY + Math.random() * 4,
      vx: 0.4 + Math.random() * 0.6,
      vy: -0.05 - Math.random() * 0.08,
      rx: 34 + Math.random() * 22,
      ry: 10 + Math.random() * 6,
      life: 14 + Math.random() * 10,
      maxLife: 24,
    })
  }
}

function spawnDamageText(x, y, damage, move, facingLeft) {
  const color = move === 'uppercut' ? '#ffd84e' : move === 'hook' ? '#ff8f64' : '#d8f0ff'
  const heavy = damage >= 20
  damageTexts.push({
    text: `${damage}`,
    x,
    y,
    vx: facingLeft ? 0.22 : -0.22,
    vy: heavy ? -1.7 : -1.35,
    color,
    size: heavy ? 34 : 28,
    scale: heavy ? 1.12 : 1,
    glow: heavy,
    life: heavy ? 26 : 22,
    maxLife: heavy ? 26 : 22,
  })
}

function spawnCombatText(x, y, text, color, size, facingLeft) {
  combatTexts.push({
    text,
    x,
    y,
    vx: facingLeft ? 0.16 : -0.16,
    vy: -1.05,
    color,
    size,
    life: 22,
    maxLife: 22,
  })
}

function spawnWhiffFx(x, y, move, facingLeft) {
  const color = MOVE_COLORS[move] || '#ffffff'
  for (let i = 0; i < 2; i++) {
    slashBursts.push({
      x: x + (facingLeft ? -1 : 1) * i * 10,
      y: y - i * 6,
      radius: move === 'hook' ? 62 + i * 16 : move === 'uppercut' ? 56 + i * 12 : 46 + i * 10,
      growth: 0.9,
      angle: move === 'uppercut' ? Math.PI * 1.5 : facingLeft ? Math.PI * 0.92 : Math.PI * 0.08,
      color,
      life: 6,
      maxLife: 6,
    })
  }
}

function spawnClinchFx(x, y) {
  shockRings.push({
    x,
    y,
    radius: 16,
    growth: 3.8,
    color: MOVE_COLORS.clinch,
    life: 9,
    maxLife: 9,
    thickness: 7,
  })
  shockRings.push({
    x,
    y: y + 12,
    radius: 8,
    growth: 2.4,
    color: '#ffd3f2',
    life: 7,
    maxLife: 7,
    thickness: 10,
  })
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -0.6 - Math.random() * 0.6,
      r: 3 + Math.random() * 2,
      color: MOVE_COLORS.clinch,
      life: 10 + Math.random() * 6,
      maxLife: 16,
    })
  }
  for (let i = 0; i < 6; i++) {
    dust.push({
      x: x + (Math.random() - 0.5) * 24,
      y: FLOOR_Y + Math.random() * 3,
      vx: (Math.random() - 0.5) * 0.9,
      vy: -0.08 - Math.random() * 0.08,
      rx: 18 + Math.random() * 12,
      ry: 7 + Math.random() * 4,
      life: 10 + Math.random() * 7,
      maxLife: 18,
    })
  }
}

function spawnBurstAt(x, y, color, damage, move) {
  const heavy = damage >= 20
  const count = heavy ? 20 : 12
  const burstKind = move === 'jab' || move === 'hook' || move === 'uppercut' ? move : null

  shockRings.push({
    x,
    y,
    radius: 18,
    growth: move === 'uppercut' ? 9.2 : heavy ? 8 : 5.5,
    color,
    life: heavy ? 18 : 12,
    maxLife: heavy ? 18 : 12,
    thickness: move === 'jab' ? 3.5 : move === 'hook' ? 6.5 : move === 'uppercut' ? 8 : 5,
  })

  for (let i = 0; i < count; i++) {
    const baseAngle = move === 'jab' ? 0 : move === 'uppercut' ? -Math.PI / 2 : null
    const angle = baseAngle === null ? (i / count) * Math.PI * 2 + Math.random() * 0.2 : baseAngle + (Math.random() - 0.5) * (move === 'jab' ? 0.26 : 0.72)
    const speed = 2.5 + Math.random() * (heavy ? 7 : 4.5)
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed * (move === 'uppercut' ? 0.65 : move === 'jab' ? 1.25 : 1),
      vy: Math.sin(angle) * speed - (move === 'uppercut' ? 2.8 : 1.5),
      r: 4 + Math.random() * 5,
      color,
      life: 18 + Math.random() * 18,
      maxLife: 36,
    })
  }

  for (let i = 0; i < count; i++) {
    const angle = move === 'uppercut'
      ? -Math.PI / 2 + (Math.random() - 0.5) * 0.55
      : move === 'jab'
        ? (Math.random() - 0.5) * 0.2
        : move === 'hook'
          ? Math.PI * 0.15 + (Math.random() - 0.5) * 0.9
          : (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3
    const speed = 8 + Math.random() * (heavy ? 10 : 6)
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed * (move === 'jab' ? 1.35 : 1),
      vy: Math.sin(angle) * speed - (move === 'uppercut' ? 2.3 : 1.4),
      color: heavy ? '#ffe178' : '#fff0c7',
      life: 5 + Math.random() * 5,
      maxLife: 10,
    })
  }

  slashBursts.push({
    x,
    y,
    radius: move === 'jab' ? (heavy ? 108 : 82) : move === 'hook' ? (heavy ? 96 : 74) : move === 'uppercut' ? (heavy ? 112 : 88) : heavy ? 90 : 68,
    growth: move === 'jab' ? 2.1 : move === 'uppercut' ? 4.2 : heavy ? 3.5 : 2.4,
    angle: move === 'jab' ? 0 : move === 'uppercut' ? Math.PI * 1.5 : move === 'hook' ? Math.PI * 0.18 : Math.random() * Math.PI,
    color,
    life: heavy ? 10 : 7,
    maxLife: heavy ? 10 : 7,
    kind: burstKind,
  })
}

function spawnMoveAura(move, x, y, facingLeft, intensity = 1) {
  const color = MOVE_COLORS[move] || '#ffffff'

  if (move === 'jab') {
    slashBursts.push({
      x: x + (facingLeft ? -18 : 18),
      y: y - 8,
      radius: 54 * intensity,
      growth: 1.2,
      angle: facingLeft ? Math.PI : 0,
      color,
      life: 5,
      maxLife: 5,
      kind: 'jab',
    })
  } else if (move === 'hook') {
    for (let i = 0; i < 2; i++) {
      slashBursts.push({
        x: x + (facingLeft ? -10 : 10),
        y: y - 4 + i * 8,
        radius: (72 + i * 18) * intensity,
        growth: 1.8,
        angle: facingLeft ? Math.PI * 0.8 : Math.PI * 0.2,
        color,
        life: 8,
        maxLife: 8,
        kind: 'hook',
      })
    }
  } else if (move === 'uppercut') {
    shockRings.push({
      x,
      y: y - 24,
      radius: 12,
      growth: 6.8 * intensity,
      color,
      life: 10,
      maxLife: 10,
      thickness: 7,
    })
    slashBursts.push({
      x,
      y: y - 18,
      radius: 68 * intensity,
      growth: 2.2,
      angle: Math.PI * 1.5,
      color,
      life: 8,
      maxLife: 8,
      kind: 'uppercut',
    })
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y - 6,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -3.8 - Math.random() * 2.8,
        r: 3 + Math.random() * 3,
        color,
        life: 10 + Math.random() * 6,
        maxLife: 18,
      })
    }
  } else if (move === 'dodge') {
    for (let i = 0; i < 2; i++) {
      slashBursts.push({
        x: x + (facingLeft ? 14 : -14) * i,
        y: y - 12,
        radius: 48 * intensity,
        growth: 0.8,
        angle: facingLeft ? Math.PI * 0.92 : Math.PI * 0.08,
        color,
        life: 6,
        maxLife: 6,
      })
    }
  } else if (move === 'clinch') {
    shockRings.push({
      x,
      y,
      radius: 10,
      growth: 4.2,
      color,
      life: 8,
      maxLife: 8,
    })
  } else if (move === 'rest') {
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y - 6,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.8 - Math.random() * 0.6,
        r: 4 + Math.random() * 2,
        color,
        life: 14 + Math.random() * 6,
        maxLife: 20,
      })
    }
  }
}

function computeOffsets() {
  if (S.t === null) {
    return { lunge1: 0, lunge2: 0, stagger1: 0, stagger2: 0 }
  }

  const gap = S.currentF2X - S.currentF1X
  const anticipation = phaseWindow('anticipation')
  const strike = phaseWindow('strike')
  const impact = phaseWindow('impact')
  const recovery = phaseWindow('recovery')
  const reposition = phaseWindow('reposition')

  let lunge1 = 0
  let lunge2 = 0
  let stagger1 = 0
  let stagger2 = 0

  const approachAmount = 10 * anticipation
  lunge1 += approachAmount
  lunge2 -= approachAmount

  lunge1 += moveLunge(S.move1, gap, strike, false)
  lunge2 += moveLunge(S.move2, gap, strike, true)

  if (S.move1 === 'dodge') {
    lunge1 -= 48 * anticipation + 38 * impact + 28 * recovery + 12 * reposition
    stagger1 -= 12 * anticipation + 8 * recovery
  }
  if (S.move2 === 'dodge') {
    lunge2 += 48 * anticipation + 38 * impact + 28 * recovery + 12 * reposition
    stagger2 += 12 * anticipation + 8 * recovery
  }

  if (S.move1 === 'clinch') lunge1 += 34 * anticipation + 24 * strike
  if (S.move2 === 'clinch') lunge2 -= 34 * anticipation + 24 * strike
  if (S.clinchLock > 0.2) {
    lunge1 += 16 * (anticipation + strike + recovery * 0.55)
    lunge2 -= 16 * (anticipation + strike + recovery * 0.55)
    stagger1 += 4 * recovery
    stagger2 -= 4 * recovery
  }
  if (S.move1 === 'rest') stagger1 -= 6 * recovery
  if (S.move2 === 'rest') stagger2 += 6 * recovery

  if (S.dmg1 > 0) stagger1 -= Math.min(60, S.dmg1 * 1.35) * (impact + recovery * 0.65)
  if (S.dmg2 > 0) stagger2 += Math.min(60, S.dmg2 * 1.35) * (impact + recovery * 0.65)
  if (S.f1HitMove === 'uppercut') stagger1 -= 16 * (impact + recovery)
  if (S.f2HitMove === 'uppercut') stagger2 += 16 * (impact + recovery)
  if (S.f1Whiff) stagger1 += 6 * recovery
  if (S.f2Whiff) stagger2 -= 6 * recovery

  lunge1 += (S.targetF1X - S.currentF1X) * reposition
  lunge2 += (S.targetF2X - S.currentF2X) * reposition

  return { lunge1, lunge2, stagger1, stagger2 }
}

function moveLunge(move, gap, strike, facingLeft) {
  const dir = facingLeft ? -1 : 1
  const effectiveGap = Math.max(0, gap - 130)

  if (move === 'jab') return dir * (42 + effectiveGap * 0.12) * easeOutCubic(strike)
  if (move === 'hook') return dir * (24 + effectiveGap * 0.22) * easeOutCubic(strike)
  if (move === 'uppercut') return dir * (12 + effectiveGap * 0.08) * easeOutCubic(strike)
  return 0
}

function phaseWindow(phaseName) {
  if (S.phase === phaseName) return S.phaseAlpha || 1
  if (S.phase === 'impact' && phaseName === 'strike') return 1
  if (S.phase === 'recovery' && (phaseName === 'impact' || phaseName === 'strike')) return 1
  if (S.phase === 'reposition' && ['recovery', 'impact', 'strike'].includes(phaseName)) return 1
  return 0
}

function drawFighter(cx, fy, color, darkColor, move, t, facingLeft, hitMove, flash, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(cx, fy)
  ctx.scale(FIGHTER_SCALE, FIGHTER_SCALE)

  const d = facingLeft ? -1 : 1
  const palette = flash ? ['#ffffff', '#dddddd', '#f7f7f7'] : [color, darkColor, lighten(color, 0.28)]
  const [main, dark, accent] = palette

  const idleBob = Math.sin(S.idleT * 4 + (facingLeft ? 0.7 : 0)) * 2.4
  const idleSway = Math.cos(S.idleT * 2.4 + (facingLeft ? 0.6 : 0)) * 1.8

  const anticipation = phaseWindow('anticipation')
  const strike = phaseWindow('strike')
  const impact = phaseWindow('impact')
  const recovery = phaseWindow('recovery')
  const reposition = phaseWindow('reposition')
  const isWhiff = facingLeft ? S.f2Whiff : S.f1Whiff
  const guardBreak = facingLeft ? S.f2GuardBreak : S.f1GuardBreak

  let torsoTilt = idleSway * 0.02
  let torsoLean = 0
  let guardLift = 0
  let headSnapX = 0
  let headSnapY = 0
  let torsoDrop = 0
  let frontArm = { upper: -0.9, lower: -0.8, extend: 0.1, lift: 0, elbowOut: 0 }
  let rearArm = { upper: -0.45, lower: -0.75, extend: 0.03, lift: -2, elbowOut: 4 }
  let leadLeg = { step: 0, lift: 0 }
  let rearLeg = { step: 0, lift: 0 }
  let bodyRise = idleBob
  let torsoSquash = 0

  if (move === 'jab') {
    torsoLean += anticipation * 6 + strike * 10 - recovery * 8
    torsoTilt -= anticipation * 0.04 + strike * 0.02
    headSnapX += strike * 4 * d
    frontArm = { upper: -0.62 + anticipation * 0.08, lower: -0.02 + strike * 0.04, extend: 1.35 * strike, lift: -2 * strike, elbowOut: 0 }
    rearArm = { upper: -1.05, lower: -1.22, extend: 0.02, lift: 4, elbowOut: -2 }
    leadLeg.step = 14 * strike
    rearLeg.step = -8 * strike
    if (isWhiff) {
      frontArm.extend += 0.28 * recovery
      torsoLean += 4 * recovery
    }
  } else if (move === 'hook') {
    torsoLean += anticipation * 12 + strike * 18 - recovery * 4
    torsoTilt += anticipation * 0.18 + strike * 0.46
    headSnapX += anticipation * 6 * d
    frontArm = { upper: -0.08 + anticipation * 0.52, lower: 1.8 * strike - 0.15, extend: 0.88, lift: -22 * strike, elbowOut: 34 }
    rearArm = { upper: -0.95, lower: -1.15, extend: 0.04, lift: 4, elbowOut: 2 }
    leadLeg.step = 16 * anticipation
    rearLeg.step = -18 * strike
    rearLeg.lift += 4 * strike
    if (isWhiff) {
      torsoTilt += 0.12 * recovery
      frontArm.lower += 0.35 * recovery
    }
  } else if (move === 'uppercut') {
    torsoDrop += anticipation * 14
    bodyRise += anticipation * 20 - strike * 38
    torsoLean += anticipation * 14 + strike * 10
    torsoTilt -= anticipation * 0.26
    headSnapY -= strike * 8
    frontArm = { upper: 0.85 + strike * 0.55, lower: -1.7 + strike * 0.35, extend: 0.42 + strike * 0.1, lift: -52 * strike, elbowOut: 10 }
    rearArm = { upper: -1.45 + anticipation * 0.6, lower: -1.4, extend: 0.02, lift: 12, elbowOut: -6 }
    leadLeg.lift = 10 * anticipation
    rearLeg.lift = 16 * anticipation
    rearLeg.step = -14 * strike
    leadLeg.step = 8 * strike
    if (isWhiff) {
      const whiffFall = recovery + reposition * 0.8
      bodyRise += 14 * recovery + 8 * reposition
      torsoLean += 12 * whiffFall
      torsoTilt -= 0.18 * whiffFall
      headSnapY += 6 * whiffFall
      frontArm.upper += 0.3 * whiffFall
      frontArm.lower += 0.24 * whiffFall
      frontArm.lift -= 16 * whiffFall
      frontArm.extend += 0.22 * whiffFall
      rearArm.upper += 0.14 * whiffFall
      rearLeg.step -= 14 * whiffFall
      leadLeg.step += 12 * whiffFall
    }
  } else if (move === 'dodge') {
    const evade = anticipation + impact * 0.9 + recovery * 0.7 + reposition * 0.5
    torsoLean -= anticipation * 34 + impact * 28 + recovery * 20 + reposition * 14
    torsoTilt -= 0.42 * anticipation - 0.08 * recovery + 0.05 * reposition
    torsoDrop += 12 * anticipation + 6 * impact + 10 * recovery + 8 * reposition
    headSnapX -= 14 * evade * d
    headSnapY += 16 * anticipation + 10 * recovery
    frontArm = { upper: -1.94, lower: -1.44, extend: 0.02, lift: 20, elbowOut: 2 }
    rearArm = { upper: -1.34, lower: -1.18, extend: 0.01, lift: 14, elbowOut: -4 }
    leadLeg.step = -32 * anticipation - 10 * recovery - 8 * reposition
    rearLeg.step = -42 * anticipation - 14 * recovery - 12 * reposition
    leadLeg.lift = 10 * anticipation + 4 * recovery
    rearLeg.lift = 4 * anticipation + 2 * recovery
  } else if (move === 'clinch') {
    torsoLean += 30 * anticipation + 26 * strike + 12 * recovery
    torsoTilt += 0.12 * anticipation
    torsoDrop += 8 * anticipation + 6 * strike
    headSnapY += 10 * strike + 4 * recovery
    frontArm = { upper: 0.34 + anticipation * 0.24, lower: 1.02 + strike * 0.14, extend: 0.92, lift: 10, elbowOut: 18 }
    rearArm = { upper: 0.08 + anticipation * 0.26, lower: 0.94 + strike * 0.2, extend: 0.84, lift: 8, elbowOut: 16 }
    leadLeg.step = 30 * anticipation + 8 * recovery
    rearLeg.step = 18 * anticipation
    if (S.clinchLock > 0.2) {
      torsoLean += 16
      torsoDrop += 8
      torsoTilt += 0.12 * d
      headSnapX += 6 * d
      headSnapY += 8
      torsoSquash += 0.16
      frontArm.extend += 0.24
      rearArm.extend += 0.22
      frontArm.lift += 8
      rearArm.lift += 6
      leadLeg.step += 6
      rearLeg.step -= 4
    }
  } else if (move === 'rest') {
    torsoLean -= 14 * anticipation - recovery * 4
    torsoDrop += 18
    bodyRise += Math.sin(S.idleT * 5.4) * 5 + 16 * recovery
    guardLift = -42
    headSnapY += 16
    frontArm = { upper: -2.12, lower: -1.52, extend: 0.01, lift: 34, elbowOut: -6 }
    rearArm = { upper: -2.02, lower: -1.34, extend: 0.01, lift: 28, elbowOut: 6 }
    leadLeg.step = -12
    rearLeg.step = 12
  }

  if (hitMove) {
    const hr = impact + recovery * 0.75
    if (hitMove === 'uppercut') {
      headSnapY -= 28 * hr
      bodyRise -= 18 * hr
      torsoLean -= 8 * hr
      torsoTilt += 0.22 * hr * d
      leadLeg.lift += 12 * hr
      rearLeg.lift += 10 * hr
      leadLeg.step -= 4 * hr * d
      rearLeg.step -= 8 * hr * d
    } else if (hitMove === 'hook') {
      const recoilDir = facingLeft ? 1 : -1
      const stumble = hr + reposition * 0.55
      headSnapX += 24 * hr * recoilDir
      headSnapY -= 4 * hr
      torsoLean += 18 * stumble * recoilDir
      torsoDrop += 6 * stumble
      torsoTilt += 0.34 * stumble * recoilDir
      leadLeg.step += 16 * stumble * recoilDir
      rearLeg.step += 26 * stumble * recoilDir
    } else {
      const recoilDir = facingLeft ? 1 : -1
      headSnapX += 11 * hr * recoilDir
      headSnapY -= 10 * hr
      torsoLean += 4 * hr * recoilDir
      torsoTilt += 0.08 * hr * recoilDir
      guardLift += 8 * hr
    }
  }

  if (guardBreak > 0.02) {
    const gb = guardBreak * (0.7 + recovery * 0.4 + impact * 0.6)
    guardLift -= 28 * gb
    torsoTilt += 0.16 * gb * d
    frontArm.upper += 0.42 * gb
    frontArm.lower += 0.38 * gb
    frontArm.extend += 0.18 * gb
    rearArm.upper += 0.3 * gb
    rearArm.lower += 0.22 * gb
    rearArm.extend += 0.12 * gb
    headSnapY -= 4 * gb
  }

  const hipX = torsoLean * d
  const hipY = -70 + bodyRise * 0.4 + torsoDrop
  const chestX = hipX + 4 * d
  const chestY = -126 + bodyRise + torsoDrop
  const headX = chestX + 8 * d + headSnapX
  const headY = chestY - 62 + headSnapY

  const leadFootX = -18 * d + leadLeg.step * d
  const rearFootX = 28 * d + rearLeg.step * d
  const leadFootY = leadLeg.lift
  const rearFootY = rearLeg.lift
  const leadKneeX = -10 * d + leadLeg.step * 0.5 * d
  const leadKneeY = -42 + leadLeg.lift * 0.5
  const rearKneeX = 20 * d + rearLeg.step * 0.45 * d
  const rearKneeY = -46 + rearLeg.lift * 0.4

  const leadShoulderX = chestX - 16 * d
  const leadShoulderY = chestY - 2 + guardLift * 0.2
  const rearShoulderX = chestX + 14 * d
  const rearShoulderY = chestY - 8 + guardLift * 0.1

  const leadElbow = polar(leadShoulderX, leadShoulderY, 26 + frontArm.extend * 9, frontArm.upper + torsoTilt, d)
  const rearElbow = polar(rearShoulderX, rearShoulderY, 24 + rearArm.extend * 6, rearArm.upper + torsoTilt, d)
  const leadGlove = polar(leadElbow.x + frontArm.elbowOut * d, leadElbow.y + frontArm.lift, 30 + frontArm.extend * 34, frontArm.lower + torsoTilt, d)
  const rearGlove = polar(rearElbow.x + rearArm.elbowOut * d, rearElbow.y + rearArm.lift, 28 + rearArm.extend * 20, rearArm.lower + torsoTilt, d)

  if (move === 'rest') drawBreathAura(chestX, chestY - 8, Math.sin(S.idleT * 7) * 0.5 + 0.5)
  drawMoveSignature(move, leadGlove.x, leadGlove.y, chestX, chestY, facingLeft, strike, anticipation, recovery, flash)

  drawLeg(hipX - 7 * d, hipY, leadKneeX, leadKneeY, leadFootX, leadFootY, dark)
  drawLeg(hipX + 12 * d, hipY, rearKneeX, rearKneeY, rearFootX, rearFootY, dark)
  drawTorso(chestX, chestY, hipX, hipY, main, dark, accent, torsoTilt, torsoSquash)
  drawArm(rearShoulderX, rearShoulderY, rearElbow.x, rearElbow.y, rearGlove.x, rearGlove.y, dark, accent, flash)
  drawArm(leadShoulderX, leadShoulderY, leadElbow.x, leadElbow.y, leadGlove.x, leadGlove.y, main, accent, flash)
  drawHead(headX, headY, main, accent, flash)
  drawGlove(leadGlove.x, leadGlove.y, 15, accent, flash)
  drawGlove(rearGlove.x, rearGlove.y, 13, dark, flash)

  ctx.restore()
}

function drawBreathAura(x, y, pulse) {
  ctx.save()
  const radius = 20 + pulse * 12
  const grad = ctx.createRadialGradient(x, y, 4, x, y, radius)
  grad.addColorStop(0, `rgba(255,255,255,${0.08 + pulse * 0.06})`)
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawMoveSignature(move, gloveX, gloveY, chestX, chestY, facingLeft, strike, anticipation, recovery, flash) {
  if (flash) return

  const color = MOVE_COLORS[move]
  const dir = facingLeft ? -1 : 1

  if (move === 'jab' && strike > 0.04) {
    ctx.save()
    ctx.strokeStyle = hexA(color, 0.38 * strike)
    ctx.lineWidth = 8 * strike
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(gloveX - 54 * dir, gloveY + 1)
    ctx.lineTo(gloveX + 10 * dir, gloveY - 1)
    ctx.stroke()
    ctx.restore()
  } else if (move === 'hook' && (anticipation > 0.04 || strike > 0.04)) {
    ctx.save()
    ctx.strokeStyle = hexA(color, 0.3 + strike * 0.2)
    ctx.lineWidth = 6 + strike * 5
    ctx.beginPath()
    ctx.arc(chestX + 6 * dir, chestY - 4, 36 + strike * 18, facingLeft ? Math.PI * 0.25 : Math.PI * 0.75, facingLeft ? Math.PI * 1.32 : Math.PI * 0.68, !facingLeft)
    ctx.stroke()
    ctx.restore()
  } else if (move === 'uppercut' && (anticipation > 0.04 || strike > 0.04)) {
    ctx.save()
    ctx.strokeStyle = hexA(color, 0.34 + strike * 0.24)
    ctx.lineWidth = 6 + strike * 6
    ctx.beginPath()
    ctx.moveTo(gloveX - 8 * dir, gloveY + 32)
    ctx.quadraticCurveTo(gloveX - 20 * dir, gloveY, gloveX + 6 * dir, gloveY - 54)
    ctx.stroke()
    ctx.restore()
  } else if (move === 'dodge' && (anticipation > 0.05 || recovery > 0.04)) {
    ctx.save()
    ctx.strokeStyle = hexA(color, 0.22 + anticipation * 0.16)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(chestX + 18 * dir, chestY - 18)
    ctx.lineTo(chestX + 54 * dir, chestY + 10)
    ctx.moveTo(chestX + 8 * dir, chestY - 36)
    ctx.lineTo(chestX + 40 * dir, chestY - 10)
    ctx.stroke()
    ctx.restore()
  } else if (move === 'clinch' && (anticipation > 0.08 || strike > 0.04)) {
    ctx.save()
    ctx.strokeStyle = hexA(color, 0.24 + strike * 0.18)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(chestX + 14 * dir, chestY + 10, 18 + strike * 10, facingLeft ? Math.PI * 0.4 : Math.PI * 0.6, facingLeft ? Math.PI * 1.2 : Math.PI * 0.8, !facingLeft)
    ctx.stroke()
    ctx.restore()
  } else if (move === 'rest') {
    ctx.save()
    ctx.strokeStyle = hexA(color, 0.18 + recovery * 0.1)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(chestX - 8, chestY - 4)
    ctx.bezierCurveTo(chestX - 20, chestY - 26, chestX - 4, chestY - 34, chestX - 14, chestY - 52)
    ctx.moveTo(chestX + 10, chestY - 2)
    ctx.bezierCurveTo(chestX + 20, chestY - 22, chestX + 6, chestY - 30, chestX + 18, chestY - 46)
    ctx.stroke()
    ctx.restore()
  }
}

function drawTorso(chestX, chestY, hipX, hipY, main, dark, accent, torsoTilt, squash = 0) {
  ctx.save()
  const centerX = (chestX + hipX) / 2
  const centerY = (chestY + hipY) / 2
  ctx.translate(centerX, centerY)
  ctx.rotate(torsoTilt)
  if (squash > 0.01) {
    ctx.scale(1 - squash, 1 + squash * 0.65)
  }
  ctx.translate(-centerX, -centerY)

  ctx.beginPath()
  ctx.moveTo(chestX - 26, chestY - 4)
  ctx.lineTo(chestX + 24, chestY - 10)
  ctx.lineTo(hipX + 18, hipY + 8)
  ctx.lineTo(hipX - 20, hipY + 12)
  ctx.closePath()
  ctx.fillStyle = main
  ctx.fill()

  ctx.fillStyle = accent
  ctx.fillRect(chestX - 18, chestY + 12, 36, 10)

  ctx.fillStyle = dark
  ctx.fillRect(chestX - 16, chestY + 22, 32, 16)
  ctx.restore()
}

function drawHead(x, y, color, accent, flash) {
  ctx.beginPath()
  ctx.arc(x, y, 17, 0, Math.PI * 2)
  ctx.fillStyle = flash ? '#ffffff' : color
  ctx.fill()

  ctx.beginPath()
  ctx.arc(x - 5, y - 4, 5, 0, Math.PI * 2)
  ctx.fillStyle = flash ? '#f7f7f7' : accent
  ctx.fill()
}

function drawArm(x1, y1, x2, y2, x3, y3, color, accent, flash) {
  ctx.lineCap = 'round'
  ctx.strokeStyle = flash ? '#ffffff' : color
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x2, y2, 5, 0, Math.PI * 2)
  ctx.fillStyle = flash ? '#ffffff' : accent
  ctx.fill()
}

function drawLeg(x1, y1, x2, y2, x3, y3, color) {
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x3, y3)
  ctx.stroke()

  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(x3, y3)
  ctx.lineTo(x3 + 12, y3 - 2)
  ctx.stroke()
}

function drawGlove(x, y, radius, color, flash) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = flash ? '#ffffff' : color
  ctx.fill()

  if (!flash) {
    ctx.beginPath()
    ctx.arc(x - radius * 0.26, y - radius * 0.2, radius * 0.38, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fill()
  }
}

function polar(x, y, length, angle, dir) {
  return {
    x: x + Math.cos(angle) * length * dir,
    y: y + Math.sin(angle) * length,
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3)
}

function hexA(hex, alpha) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0')
  return hex + a
}

function lighten(hex, amount) {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + 255 * amount)
  const g = Math.min(255, ((num >> 8) & 0xff) + 255 * amount)
  const b = Math.min(255, (num & 0xff) + 255 * amount)
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}
