/**
 * renderer.js — Street Fighter / Tekken-style impact animations.
 *
 * Core systems:
 *  - HITSTOP: animation freezes for 115ms at impact (signature SF feel)
 *  - HIT FLASH: fighter silhouette turns white on impact
 *  - SF SPARKS: bright line-burst sparks at contact point
 *  - SCREEN FLASH: white overlay on power hits
 *  - LUNGE SYSTEM: fighters rush to contact, no gliding
 *  - NO LERP DURING ANIMATION: position snaps, fighters don't drift
 *  - SCALE 1.4×: fighters fill the arena properly
 */
const Renderer = (() => {

  const W = 860, H = 440;
  const FLOOR_Y = 372;
  const FIGHTER_SCALE = 1.4;
  const ARM_REACH = 135; // screen px at scale 1.4 (98 local units * 1.4)

  // [F1x, F2x] per distance level
  const DIST_POS = [
    [198, 662],  // outside (0)  gap=464
    [258, 602],  // mid    (1)   gap=344
    [318, 542],  // inside (2)   gap=224
  ];

  const IDLE_LERP   = 0.28;  // lerp speed between rounds (no glide during anim)
  const ANIM_DUR    = 660;   // ms per round animation
  const HITSTOP_MS  = 115;   // ms freeze on impact
  const FLASH_MS    = 90;    // ms hit-flash duration
  const IMPACT_T    = 0.26;  // animation t at fist peak / impact fires

  const C1      = '#e84b4b';
  const C1_DARK = '#902828';
  const C2      = '#4b9ee8';
  const C2_DARK = '#2860a0';

  let canvas, ctx;
  let idleRafId = null;
  let animRafId = null;
  let animStart = null;

  let idleT  = 0;
  let lastTs = null;
  let shake  = 0;

  // Hitstop: accumulate paused time so t stays frozen
  let hitstopOffset = 0;
  let inHitstop     = false;
  let hitstopEnd    = 0;

  // Hit flash: real-time timestamps for white silhouette
  let flash1End = 0;
  let flash2End = 0;

  // Screen-wide flash alpha (fades each frame)
  let screenFlash = 0;

  let particles   = [];
  let impactRings = [];
  let sparks      = []; // SF-style line sparks

  let actionMoves  = null;
  let actionDamage = null;
  let actionDone   = null;
  let impactFired  = false;

  let currentF1X = DIST_POS[1][0];
  let currentF2X = DIST_POS[1][1];
  let targetF1X  = DIST_POS[1][0];
  let targetF2X  = DIST_POS[1][1];

  // ── Easing ───────────────────────────────────────────────────────────────────
  const eOut3 = t => 1 - Math.pow(1 - t, 3);
  const eIn2  = t => t * t;
  const eBell = t => Math.sin(t * Math.PI);

  /** Faster snap: peaks at IMPACT_T, then retracts */
  function punchCurve(t) {
    if (t < IMPACT_T) return eOut3(t / IMPACT_T);
    return 1 - eIn2((t - IMPACT_T) / (1 - IMPACT_T));
  }

  function hexA(hex, alpha) {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
                  .toString(16).padStart(2, '0');
    return hex + a;
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    _startIdleLoop();
  }

  // ── Idle loop — lerp only runs here, not during animation ────────────────────
  function _startIdleLoop() {
    function tick(ts) {
      if (lastTs !== null) idleT += (ts - lastTs) * 0.001;
      lastTs = ts;
      shake *= 0.78;
      screenFlash = Math.max(0, screenFlash - 0.055);

      // Position lerp ONLY when not animating
      if (!animRafId) {
        currentF1X += (targetF1X - currentF1X) * IDLE_LERP;
        currentF2X += (targetF2X - currentF2X) * IDLE_LERP;
        particles   = particles.filter(p => p.life > 0);
        impactRings = impactRings.filter(r => r.t < r.max);
        sparks      = sparks.filter(s => s.life > 0);
        _drawScene(null, ts);
      }

      idleRafId = requestAnimationFrame(tick);
    }
    idleRafId = requestAnimationFrame(tick);
  }

  // ── Public: set distance level ───────────────────────────────────────────────
  function setDistance(level) {
    const pos = DIST_POS[level] || DIST_POS[1];
    targetF1X = pos[0];
    targetF2X = pos[1];
  }

  // ── Public: animate a round ──────────────────────────────────────────────────
  function animateRound(move1, move2, dmgToF1, dmgToF2, distBefore, distAfter, onDone) {
    actionMoves  = { f1: move1, f2: move2 };
    actionDamage = { f1: dmgToF1 || 0, f2: dmgToF2 || 0 };
    actionDone   = onDone || null;
    impactFired  = false;
    animStart    = null;

    // Reset hitstop for this round
    hitstopOffset = 0;
    inHitstop     = false;
    hitstopEnd    = 0;

    // SNAP fighters to before-position — no lerp during animation
    const posBefore = DIST_POS[distBefore] || DIST_POS[1];
    const posAfter  = DIST_POS[distAfter]  || DIST_POS[1];
    currentF1X = posBefore[0];
    currentF2X = posBefore[1];
    targetF1X  = posAfter[0];
    targetF2X  = posAfter[1];

    if (animRafId) cancelAnimationFrame(animRafId);

    function tick(ts) {
      if (!animStart) animStart = ts;
      const dt = lastTs ? ts - lastTs : 0;
      if (lastTs !== null) idleT += dt * 0.001;
      lastTs = ts;

      // Accumulate hitstop pause time — keeps t frozen
      if (inHitstop) {
        hitstopOffset += dt;
        if (ts >= hitstopEnd) inHitstop = false;
      }

      const t = Math.min((ts - animStart - hitstopOffset) / ANIM_DUR, 1);

      shake *= 0.78;
      screenFlash = Math.max(0, screenFlash - 0.055);

      // Advance effects every frame (even during hitstop — they keep moving)
      particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.life--; });
      sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life--; });
      particles   = particles.filter(p => p.life > 0);
      impactRings.forEach(r => r.t++);
      impactRings = impactRings.filter(r => r.t < r.max);
      sparks      = sparks.filter(s => s.life > 0);

      // ── Impact fires at peak ──────────────────────────────────────────────
      if (!impactFired && t >= IMPACT_T) {
        impactFired = true;
        const gap  = currentF2X - currentF1X;
        const ATKS = ['jab', 'hook', 'uppercut'];
        // punchCurve(IMPACT_T) = 1.0 — compute lunge at peak
        const maxApproach = Math.max(0, gap - 60) * 0.5;

        if (actionDamage.f2 > 0 && ATKS.includes(actionMoves.f1)) {
          const l1   = Math.min(Math.max(0, gap - ARM_REACH) * 0.82, maxApproach);
          const impX = currentF1X + l1 + ARM_REACH * 0.82;
          const impY = FLOOR_Y - 148;
          _spawnImpact(impX, impY, C1, actionDamage.f2);
          _spawnSparks(impX, impY, '#ffe566', actionDamage.f2 >= 20 ? 16 : 10);
          flash2End = ts + HITSTOP_MS + FLASH_MS;
        }
        if (actionDamage.f1 > 0 && ATKS.includes(actionMoves.f2)) {
          const l2   = Math.min(Math.max(0, gap - ARM_REACH) * 0.82, maxApproach);
          const impX = currentF2X - l2 - ARM_REACH * 0.82;
          const impY = FLOOR_Y - 148;
          _spawnImpact(impX, impY, C2, actionDamage.f1);
          _spawnSparks(impX, impY, '#ffe566', actionDamage.f1 >= 20 ? 16 : 10);
          flash1End = ts + HITSTOP_MS + FLASH_MS;
        }
        // Fallback for non-attack damage
        if (actionDamage.f2 > 0 && !ATKS.includes(actionMoves.f1)) {
          const mx = (currentF1X + currentF2X) / 2;
          _spawnImpact(mx, FLOOR_Y - 140, C1, actionDamage.f2);
          flash2End = ts + FLASH_MS;
        }
        if (actionDamage.f1 > 0 && !ATKS.includes(actionMoves.f2)) {
          const mx = (currentF1X + currentF2X) / 2;
          _spawnImpact(mx, FLOOR_Y - 140, C2, actionDamage.f1);
          flash1End = ts + FLASH_MS;
        }

        // Engage hitstop on any damage
        const anyDmg = actionDamage.f1 > 0 || actionDamage.f2 > 0;
        if (anyDmg) {
          inHitstop  = true;
          hitstopEnd = ts + HITSTOP_MS;
          const maxDmg = Math.max(actionDamage.f1, actionDamage.f2);
          if (maxDmg >= 20) { screenFlash = 0.48; shake = Math.max(shake, maxDmg * 0.5); }
          else if (maxDmg > 0) { screenFlash = 0.18; shake = Math.max(shake, maxDmg * 0.28); }
        }
      }

      _drawScene(t, ts);

      if (t < 1) {
        animRafId = requestAnimationFrame(tick);
      } else {
        // SNAP to final position — no drift
        currentF1X = targetF1X;
        currentF2X = targetF2X;
        animRafId  = null;
        if (actionDone) actionDone();
      }
    }

    animRafId = requestAnimationFrame(tick);
  }

  // ── Public: reset to idle ────────────────────────────────────────────────────
  function drawIdle() {
    particles   = [];
    impactRings = [];
    sparks      = [];
    shake       = 0;
    screenFlash = 0;
    actionMoves = null;
    currentF1X  = DIST_POS[1][0];
    currentF2X  = DIST_POS[1][1];
    targetF1X   = DIST_POS[1][0];
    targetF2X   = DIST_POS[1][1];
    _drawScene(null, performance.now());
  }

  // ── Impact effects ───────────────────────────────────────────────────────────
  function _spawnImpact(x, y, color, damage) {
    impactRings.push({ x, y, color, t: 0, max: 18, star: damage >= 20 });
    const count = damage >= 20 ? 18 : 10;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2.8 + Math.random() * 6.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 2.8,
        r:  2.5 + Math.random() * 4,
        color,
        life:    26 + Math.floor(Math.random() * 18),
        maxLife: 44,
      });
    }
  }

  /** Street Fighter line-burst sparks — bright streaks radiating outward */
  function _spawnSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const spd   = 5.5 + Math.random() * 10;
      sparks.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 1.5,
        color,
        life:    5 + Math.floor(Math.random() * 5),
        maxLife: 10,
      });
    }
  }

  // ── Lunge / stagger computation ──────────────────────────────────────────────
  function _computeOffsets(t) {
    const none = { lunge1:0, lunge2:0, stagger1:0, stagger2:0, f1HitMove:null, f2HitMove:null };
    if (t === null || !actionMoves) return none;

    const gap  = currentF2X - currentF1X;
    const ATKS = ['jab', 'hook', 'uppercut'];
    const m1   = actionMoves.f1,  m2 = actionMoves.f2;
    const d1   = actionDamage.f2; // damage F1 deals to F2
    const d2   = actionDamage.f1; // damage F2 deals to F1
    const pc   = punchCurve(t);
    const be   = eBell(t);

    // Max approach: both fighters meet with ~60px gap at peak
    const maxApproach = Math.max(0, gap - 60) * 0.5;

    // F1 lunge (positive = right, toward F2)
    let lunge1 = 0;
    if (ATKS.includes(m1)) {
      const frac = d1 > 0 ? 0.82 : 0.3;
      lunge1 = Math.min(Math.max(0, gap - ARM_REACH) * frac, maxApproach) * pc;
    } else if (m1 === 'clinch') {
      lunge1 = Math.min(Math.max(0, gap - 50) * 0.55, maxApproach) * be;
    } else if (m1 === 'dodge') {
      lunge1 = -Math.min(gap * 0.14, 65) * be;
    }

    // F2 lunge (negative = left, toward F1)
    let lunge2 = 0;
    if (ATKS.includes(m2)) {
      const frac = d2 > 0 ? 0.82 : 0.3;
      lunge2 = -(Math.min(Math.max(0, gap - ARM_REACH) * frac, maxApproach) * pc);
    } else if (m2 === 'clinch') {
      lunge2 = -(Math.min(Math.max(0, gap - 50) * 0.55, maxApproach) * be);
    } else if (m2 === 'dodge') {
      lunge2 = Math.min(gap * 0.14, 65) * be;
    }

    // Stagger: fires after impact, drives defender away
    const STAGGER_T = IMPACT_T + 0.06;
    let stagger1 = 0, stagger2 = 0;
    let f1HitMove = null, f2HitMove = null;
    if (t >= STAGGER_T) {
      const st = Math.min((t - STAGGER_T) / (1 - STAGGER_T), 1);
      if (d2 > 0) { stagger1 = -Math.min(d2 * 1.0, 48) * eBell(st); f1HitMove = m2; }
      if (d1 > 0) { stagger2 =  Math.min(d1 * 1.0, 48) * eBell(st); f2HitMove = m1; }
    }

    return { lunge1, lunge2, stagger1, stagger2, f1HitMove, f2HitMove };
  }

  // ── Main scene compositor ────────────────────────────────────────────────────
  function _drawScene(t, now) {
    ctx.save();

    if (shake > 0.5) {
      ctx.translate(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake * 0.4
      );
    }

    _drawBackground();
    _drawCrowd();
    _drawRing();

    // Particles
    particles.forEach(p => {
      const a = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
      ctx.fillStyle = hexA(p.color, a * 0.9);
      ctx.fill();
    });

    // SF-style line sparks
    ctx.save();
    sparks.forEach(s => {
      const a   = s.life / s.maxLife;
      const len = 0.18 + (1 - a) * 0.05;
      ctx.strokeStyle = hexA(s.color, a);
      ctx.lineWidth   = 2.8 * a;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * len * 10, s.y - s.vy * len * 10);
      ctx.stroke();
      // White core
      ctx.strokeStyle = hexA('#ffffff', a * 0.6);
      ctx.lineWidth   = 1.2 * a;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * len * 6, s.y - s.vy * len * 6);
      ctx.stroke();
    });
    ctx.restore();

    // Impact rings
    impactRings.forEach(r => {
      const prog   = r.t / r.max;
      const alpha  = 1 - prog;
      const radius = 10 + r.t * 24;

      if (r.star) {
        ctx.save();
        ctx.translate(r.x, r.y);
        // Outer burst
        const spikes = 8;
        const r1 = 10 + prog * 32;
        const r2 = r1 * 1.8;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i / (spikes * 2)) * Math.PI * 2 - Math.PI * 0.5;
          const rr  = i % 2 === 0 ? r2 : r1;
          if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          else         ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hexA(r.color, alpha * 0.5);
        ctx.fill();
        // White inner flash
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i / (spikes * 2)) * Math.PI * 2 - Math.PI * 0.5;
          const rr  = i % 2 === 0 ? r1 * 0.72 : r1 * 0.36;
          if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          else         ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = hexA('#ffffff', alpha * 0.85);
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = hexA(r.color, alpha * 0.82);
      ctx.lineWidth   = 3.5 * alpha;
      ctx.stroke();
      // Bright inner ring
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius * 0.4, 0, Math.PI * 2);
      ctx.strokeStyle = hexA('#ffffff', alpha * 0.55);
      ctx.lineWidth   = 2.5 * alpha;
      ctx.stroke();
    });

    // Compute lunge/stagger positions
    const { lunge1, lunge2, stagger1, stagger2, f1HitMove, f2HitMove } = _computeOffsets(t);
    const f1DrawX = currentF1X + lunge1 + stagger1;
    const f2DrawX = currentF2X + lunge2 + stagger2;

    const f1Flash = now != null && now < flash1End;
    const f2Flash = now != null && now < flash2End;

    if (t !== null && actionMoves) {
      _drawFighter(f1DrawX, FLOOR_Y, C1, C1_DARK, actionMoves.f1, t, false, f1HitMove, f1Flash);
      _drawFighter(f2DrawX, FLOOR_Y, C2, C2_DARK, actionMoves.f2, t, true,  f2HitMove, f2Flash);
    } else {
      _drawFighter(currentF1X, FLOOR_Y, C1, C1_DARK, 'idle', 0, false, null, false);
      _drawFighter(currentF2X, FLOOR_Y, C2, C2_DARK, 'idle', 0, true,  null, false);
    }

    // Full-screen flash on big hits
    if (screenFlash > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${screenFlash * 0.9})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  // ── Environment ──────────────────────────────────────────────────────────────
  function _drawBackground() {
    const g = ctx.createRadialGradient(W/2, H*0.55, 20, W/2, H*0.55, W*0.7);
    g.addColorStop(0, '#1c1028');
    g.addColorStop(1, '#07060e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const spot = ctx.createRadialGradient(W/2, -60, 10, W/2, H*0.42, 380);
    spot.addColorStop(0,    'rgba(232,184,75,0.14)');
    spot.addColorStop(0.55, 'rgba(232,184,75,0.05)');
    spot.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);
  }

  function _drawCrowd() {
    const topY = 28, crowdH = 90;
    ctx.save();
    ctx.beginPath(); ctx.rect(60, topY, W - 120, crowdH); ctx.clip();
    for (let i = 0; i < 95; i++) {
      const px  = 65 + (i/95)*(W-130) + Math.sin(i*2.3)*7;
      const row = i % 4;
      const py  = topY + 6 + row*20 + Math.sin(i*1.9)*3;
      const rx  = 5.5 + Math.abs(Math.sin(i*2.7))*2;
      const lum = 15 + Math.abs(Math.sin(i*1.4))*25;
      ctx.beginPath(); ctx.ellipse(px, py, rx, rx*1.2, 0, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${lum+5},${lum},${lum+15},0.45)`; ctx.fill();
    }
    const fade = ctx.createLinearGradient(0, topY, 0, topY+crowdH);
    fade.addColorStop(0,    'rgba(0,0,0,0)');
    fade.addColorStop(0.45, 'rgba(10,8,18,0.5)');
    fade.addColorStop(1,    'rgba(10,8,18,0.95)');
    ctx.fillStyle = fade; ctx.fillRect(60, topY, W-120, crowdH);
    ctx.restore();
  }

  function _drawRing() {
    const rx=55, ry=FLOOR_Y+2, rw=W-110, rh=H-ry-2;
    const mat = ctx.createLinearGradient(0, ry, 0, ry+rh);
    mat.addColorStop(0, '#251a36'); mat.addColorStop(1, '#160e22');
    ctx.fillStyle = mat; ctx.fillRect(rx, ry, rw, rh);

    ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.028)'; ctx.lineWidth=1;
    for (let x=rx+38; x<rx+rw; x+=38) {
      ctx.beginPath(); ctx.moveTo(x,ry); ctx.lineTo(x,ry+rh); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle='#c8a96e'; ctx.lineWidth=2.5; ctx.strokeRect(rx,ry,rw,rh);

    [rx, rx+rw].forEach(x => {
      const pg = ctx.createLinearGradient(x-7,0,x+7,0);
      pg.addColorStop(0,'#555'); pg.addColorStop(0.45,'#aaa'); pg.addColorStop(1,'#444');
      ctx.fillStyle=pg; ctx.fillRect(x-7,ry-72,14,rh+72);
      ctx.fillStyle='#c8a96e'; ctx.fillRect(x-9,ry-76,18,7);
    });

    [ry-54, ry-33, ry-14].forEach((y,i) => {
      ctx.beginPath(); ctx.strokeStyle=`rgba(140,20,20,${i===1?0.9:0.7})`; ctx.lineWidth=4.5;
      ctx.moveTo(rx,y); ctx.lineTo(rx+rw,y); ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle='rgba(255,80,80,0.18)'; ctx.lineWidth=1.5;
      ctx.moveTo(rx,y-1.5); ctx.lineTo(rx+rw,y-1.5); ctx.stroke();
    });

    ctx.beginPath(); ctx.strokeStyle='rgba(200,169,110,0.12)'; ctx.lineWidth=1.5;
    ctx.setLineDash([10,9]); ctx.moveTo(W/2,ry); ctx.lineTo(W/2,ry+rh); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Drawing primitives ───────────────────────────────────────────────────────
  function _limb(x1,y1,x2,y2,w,color) {
    ctx.save();
    ctx.strokeStyle=color; ctx.lineWidth=w; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.restore();
  }
  function _jnt(x,y,r,color) {
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
  }
  function _glove(x,y,r,color,flashColor) {
    const gc = flashColor || color;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=gc; ctx.fill();
    if (!flashColor) {
      ctx.beginPath(); ctx.arc(x-r*0.28,y-r*0.28,r*0.42,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
  }

  // ── Fighter drawing ───────────────────────────────────────────────────────────
  /**
   * @param cx         - center x (screen coords, after lunge/stagger)
   * @param fy         - floor y (screen coords)
   * @param color      - fighter primary color
   * @param darkClr    - back-limb color
   * @param move       - current move
   * @param t          - animation progress 0..1
   * @param facingLeft - true for fighter 2
   * @param hitMove    - the move that hit this fighter (null if not hit)
   * @param hitFlash   - true when white flash is active
   */
  function _drawFighter(cx, fy, color, darkClr, move, t, facingLeft, hitMove, hitFlash) {
    ctx.save();
    // Translate to fighter position, then scale up to SF proportions
    ctx.translate(cx, fy);
    ctx.scale(FIGHTER_SCALE, FIGHTER_SCALE);

    // Hit flash: override colors with white
    const c  = hitFlash ? '#ffffff' : color;
    const dc = hitFlash ? '#dddddd' : darkClr;
    const fc = hitFlash ? '#ffffff' : null; // glove flash color

    const d    = facingLeft ? -1 : 1;
    const bob  = Math.sin(idleT * 3.8) * 2.8;
    const sway = Math.cos(idleT * 2.2) * 1.5;

    // ── Base joint positions (local space, (0,0) = cx,fy) ────────────────────
    let hx = 5*d + sway*0.4,  hy = -158 + bob;
    const HR = 12.5;

    let fsX=-4*d,  fsY=-131+bob;
    let rsX=18*d,  rsY=-131+bob;

    let feX=14*d,  feY=-116+bob;
    let fgX=38*d,  fgY=-124+bob;
    const GR = 12;

    let reX=20*d, reY=-105+bob;
    let rgX=17*d, rgY=-126+bob;

    let hpX=3*d, hpY=-78+bob*0.4;
    let fkX=-14*d, fkY=-40;
    let ffX=-20*d, ffY=0;
    let rkX=20*d,  rkY=-40;
    let rfX=26*d,  rfY=0;

    // ── Move animations ───────────────────────────────────────────────────────
    if (move === 'jab') {
      const p = punchCurve(t);
      // Ghost trail during extension
      if (t > 0.03 && t < IMPACT_T + 0.03) {
        const pP = punchCurve(Math.max(0, t - 0.07));
        ctx.beginPath();
        ctx.arc(38*d + 60*d*pP, -124 + bob - 5*pP, GR*0.62, 0, Math.PI*2);
        ctx.fillStyle = hexA(c, 0.22); ctx.fill();
      }
      fgX+=60*d*p; fgY-=6*p;
      feX+=26*d*p; feY-=3*p;
      fsX-=6*d*p;  hx+=10*d*p;
      ffX+=14*d*p; fkX+=9*d*p;
      rgY-=5*p;

    } else if (move === 'hook') {
      const p = punchCurve(t);
      if (t > 0.03 && t < IMPACT_T + 0.03) {
        const pP = punchCurve(Math.max(0, t - 0.07));
        const aP = pP * Math.PI * 0.72;
        ctx.beginPath();
        ctx.arc((Math.cos(aP)*52+3)*d, -118+Math.sin(aP)*28+bob, GR*0.62, 0, Math.PI*2);
        ctx.fillStyle = hexA(c, 0.22); ctx.fill();
      }
      const angle = p * Math.PI * 0.72;
      reX=(Math.cos(angle)*26+8)*d; reY=-122+Math.sin(angle)*-8+bob;
      rgX=(Math.cos(angle)*52+3)*d; rgY=-118+Math.sin(angle)*28+bob;
      rsX+=10*d*p; hx+=9*d*p; rfX-=10*d*p;

    } else if (move === 'uppercut') {
      const ph1=Math.min(t/0.3,1), ph2=Math.max((t-0.3)/0.7,0);
      const dip=eOut3(ph1)*16, rise=eOut3(ph2);
      hy+=dip; hx-=3*d*eOut3(ph1);
      fsY+=dip*0.8; rsY+=dip*0.8; feY+=dip*0.8; reY+=dip*0.8; hpY+=dip*0.5;
      reX=(17+rise*-7)*d; reY=-95+dip*0.8-rise*42+bob;
      rgX=(16+rise*15)*d; rgY=-100+dip*0.8-rise*80+bob;
      hy+=dip-rise*10;

    } else if (move === 'dodge') {
      const p = eBell(t);
      hx-=40*d*p; hy+=20*p;
      fsX-=22*d*p; rsX-=10*d*p; fsY+=12*p; rsY+=6*p;
      feX-=20*d*p; feY+=12*p; fgX-=28*d*p; fgY+=18*p;
      reX-=10*d*p; reY+=5*p; rgX-=12*d*p; rgY+=12*p;
      hpX-=10*d*p;

    } else if (move === 'clinch') {
      const p = eBell(t);
      fgX+=34*d*p; feX+=18*d*p;
      rgX+=30*d*p; reX+=15*d*p;
      ffX+=18*d*p; fkX+=12*d*p; hx+=8*d*p;

    } else if (move === 'rest') {
      const r = Math.min(t*2.5, 1);
      fgY+=28*r; feY+=16*r; fgX-=10*d*r; feX-=6*d*r;
      rgY+=22*r; reY+=12*r; hy+=9*r; hx-=5*d*r; fsY+=4*r; rsY+=4*r;
    }

    // ── Hit reaction poses — different per attack type ────────────────────────
    if (hitMove && t >= IMPACT_T + 0.04) {
      const hr  = eBell(Math.min((t - IMPACT_T - 0.04) / 0.52, 1));
      const bk  = facingLeft ? 1 : -1; // "backward" direction for this fighter

      if (hitMove === 'uppercut') {
        // Launched upward: full body rises, arms fly wide, legs leave ground
        hy  -= 28 * hr;   hx  += bk * 10 * hr;
        fsY -= 14 * hr;   rsY -= 11 * hr;
        fgY -= 22 * hr;   fgX += bk * 22 * hr;
        rgY -= 16 * hr;   rgX += bk * 16 * hr;
        ffY -= 16 * hr;   rfY -= 10 * hr;
        ffX += bk * 10 * hr;

      } else if (hitMove === 'hook') {
        // Full body spin: head snaps far, torso rotates
        hx  += bk * 26 * hr;  hy  -= 8 * hr;
        fsX += bk * 16 * hr;  rsX += bk * 9 * hr;
        feX += bk * 18 * hr;  fgX += bk * 24 * hr;  fgY -= 6 * hr;
        hpX += bk * 12 * hr;
        rfX -= bk * 8 * hr; // legs swing opposite

      } else {
        // Generic jab stagger: head snaps back, torso leans, arms fly out
        hx  += bk * 20 * hr;  hy -= 14 * hr;
        fsX += bk * 12 * hr;  rsX += bk * 7 * hr;
        fsY +=  8 * hr;
        fgX += bk * 16 * hr;  fgY -= 10 * hr;
        rgX += bk * 11 * hr;
        hpX += bk * 6 * hr;
      }
    }

    // ── Draw order: back elements first, front elements last ─────────────────
    const smX = (fsX+rsX)*0.5, smY = (fsY+rsY)*0.5;

    // Back leg
    _limb(hpX,hpY, rkX,rkY, 9,dc);
    _limb(rkX,rkY, rfX,rfY, 8,dc);
    _limb(rfX,rfY, rfX+14*d,rfY-2, 7,dc);
    _jnt(rkX, rkY, 3.5, dc);

    // Rear arm
    _limb(rsX,rsY, reX,reY, 7,dc);
    _limb(reX,reY, rgX,rgY, 6,dc);
    _jnt(reX, reY, 3, dc);
    _glove(rgX, rgY, GR, dc, fc);

    // Skeleton torso: hip bar + spine + shoulder bar
    _limb(hpX-10*d,hpY, hpX+10*d,hpY, 5,c);
    _limb(smX,smY, hpX,hpY, 5,c);
    _limb(fsX,fsY, rsX,rsY, 6,c);
    _jnt(hpX,hpY, 4.5,c);
    _jnt(fsX,fsY, 4,c);
    _jnt(rsX,rsY, 4,c);

    // Neck
    _limb(smX,smY, hx,hy+HR, 7,c);

    // Front leg
    _limb(hpX,hpY, fkX,fkY, 9,c);
    _limb(fkX,fkY, ffX,ffY, 8,c);
    _limb(ffX,ffY, ffX+10*d,ffY-3, 7,c);
    _jnt(fkX,fkY, 3.5,c);

    // Head
    ctx.beginPath(); ctx.arc(hx,hy,HR,0,Math.PI*2); ctx.fillStyle=c; ctx.fill();
    if (!hitFlash) {
      ctx.beginPath(); ctx.arc(hx-HR*0.3*d,hy-HR*0.3,HR*0.45,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.13)'; ctx.fill();
    }

    // Front arm (drawn last = on top)
    _limb(fsX,fsY, feX,feY, 7,c);
    _limb(feX,feY, fgX,fgY, 6,c);
    _jnt(feX,feY, 3,c);
    _glove(fgX,fgY, GR, c, fc);

    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return { init, animateRound, drawIdle, setDistance };

})();
