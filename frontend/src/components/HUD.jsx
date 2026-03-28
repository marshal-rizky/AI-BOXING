import { motion, AnimatePresence } from 'framer-motion'

const DIST_LABELS = ['OUTSIDE', 'MID', 'INSIDE']
const DIST_COLORS = ['#7fa4bf', '#e8b84b', '#ff7d5a']

const MOVE_ICONS = {
  jab: '->',
  hook: '~>',
  uppercut: '^',
  dodge: '<>',
  clinch: '[]',
  rest: '--',
}

export function HUD({ f1, f2, roundNum, maxRounds, distance, moves, phase, impact, cue, lowHealth }) {
  const pulseScale = impact?.isUppercut && impact?.intensity >= 20
    ? 1.1
    : impact?.intensity >= 20
      ? 1.06
      : impact?.intensity > 0
        ? 1.02
        : 1
  const impactTone = impact?.isCounter
    ? 'red'
    : impact?.isUppercut
      ? 'gold'
      : impact?.isHook
        ? 'red'
        : impact?.move === 'jab'
          ? 'blue'
          : 'neutral'

  return (
    <div id="hud" className={`hud-phase-${phase} hud-impact-${impactTone}`}>
      <div id="hud-top">
        <FighterPanel fighter={f1} side="left" color="#e84b4b" low={lowHealth?.f1} />
        <RoundBadge round={roundNum} maxRounds={maxRounds} distance={distance} phase={phase} />
        <FighterPanel fighter={f2} side="right" color="#4b9ee8" low={lowHealth?.f2} />
      </div>

      <AnimatePresence>
        {cue && (
          <motion.div
            key={cue.id}
            className={`arena-banner arena-banner-${cue.tone} arena-banner-impact-${impactTone}`}
            initial={{ opacity: 0, scale: 0.78, y: 12 }}
            animate={{ opacity: 1, scale: pulseScale, y: 0 }}
            exit={{ opacity: 0, scale: 1.08, y: -14 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            <span className="arena-banner-label">{cue.label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div id="hud-bottom">
        <MoveCallout move={moves?.f1} side="left" color="#e84b4b" phase={phase} impact={impact} />
        <CenterTelemetry phase={phase} impact={impact} />
        <MoveCallout move={moves?.f2} side="right" color="#4b9ee8" phase={phase} impact={impact} />
      </div>
    </div>
  )
}

const PERK_ICONS = {
  'Iron Chin': '🛡',
  'Glass Cannon': '💥',
  'Marathon Runner': '🏃',
  'Counter Puncher': '↩',
  'Clinch Master': '🤼',
  'Rope-a-Dope': '🪢',
  'First Strike': '⚡',
  'Second Wind': '💨',
}

const PERK_DESCRIPTIONS = {
  'Iron Chin': '-10% damage taken',
  'Glass Cannon': '+15% damage dealt, -10 HP',
  'Marathon Runner': '+25% stamina recovery on rest',
  'Counter Puncher': '+20% damage on the round after a successful dodge',
  'Clinch Master': 'Clinch also deals 5 damage',
  'Rope-a-Dope': '+3% cumulative damage bonus per hit taken',
  'First Strike': 'Rounds 1-3 attacks deal +25% damage',
  'Second Wind': 'When HP drops below 30, recover 15 stamina (once per fight)',
}

function FighterPanel({ fighter, side, color, low }) {
  const isRight = side === 'right'
  const perks = fighter?.perks || []
  return (
    <motion.div
      className={`hud-panel hud-panel-${side}${low ? ' hud-panel-danger' : ''}`}
      animate={low ? { boxShadow: ['0 0 0 rgba(0,0,0,0)', `0 0 24px ${color}66`, '0 0 0 rgba(0,0,0,0)'] } : { boxShadow: '0 0 0 rgba(0,0,0,0)' }}
      transition={low ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
    >
      <div className="hud-name" style={{ color }}>{fighter?.name || '--'}</div>
      <StatRow label="HP" value={fighter?.hp ?? 100} max={100} reversed={isRight} color={hpColor(fighter?.hp ?? 100)} />
      <StatRow label="ST" value={fighter?.st ?? 100} max={100} reversed={isRight} color="#3a9adc" />
      {perks.length > 0 && (
        <div className="hud-perks">
          {perks.map(p => (
            <span key={p} className="hud-perk-badge" style={{ pointerEvents: 'auto' }}>
              {PERK_ICONS[p] || '?'} {p}
              <span className="perk-tooltip">{PERK_DESCRIPTIONS[p] || p}</span>
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

function StatRow({ label, value, max, reversed, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`hud-bar-row${reversed ? ' hud-bar-row-right' : ''}`}>
      {reversed && <span className="hud-val">{Math.round(value)}</span>}
      <span className="hud-lbl">{label}</span>
      <div className="hud-track">
        <motion.div
          className={`hud-fill${reversed ? ' hud-fill-right' : ''}`}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 180, damping: 22, mass: 0.8 }}
          style={{ background: reversed ? `linear-gradient(270deg, ${color}88, ${color})` : `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
      {!reversed && <span className="hud-val">{Math.round(value)}</span>}
    </div>
  )
}

function RoundBadge({ round, maxRounds, distance, phase }) {
  const distColor = DIST_COLORS[distance] || DIST_COLORS[1]
  const distLabel = DIST_LABELS[distance] || 'MID'

  return (
    <motion.div
      id="hud-center"
      animate={phase === 'impact' ? { scale: 1.03, y: -2 } : { scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 20 }}
    >
      <div id="round-label">ROUND</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={round}
          id="round-number"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        >
          {round || '--'}
        </motion.div>
      </AnimatePresence>
      <div id="round-of">of {maxRounds || 12}</div>

      <AnimatePresence mode="wait">
        <motion.div
          key={distLabel}
          id="distance-indicator"
          style={{ color: distColor, borderColor: `${distColor}55` }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.06, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {distLabel}
        </motion.div>
      </AnimatePresence>

      <div className="round-dots">
        {Array.from({ length: maxRounds || 12 }, (_, i) => (
          <div
            key={i}
            className={`round-dot${i < (round || 0) ? ' past' : ''}${i === (round || 0) - 1 ? ' current' : ''}`}
          />
        ))}
      </div>
    </motion.div>
  )
}

function MoveCallout({ move, side, color, phase, impact }) {
  const isRight = side === 'right'
  const xInitial = isRight ? 56 : -56
  const flashColor = impact?.isUppercut
    ? '#ffd84e'
    : impact?.isHook
      ? '#ff7d5a'
      : impact?.move === 'jab'
        ? '#7bc8ff'
        : color

  return (
    <AnimatePresence mode="wait">
      {move && (
        <motion.div
          key={`${side}-${move}`}
          className={`callout callout-${side}${phase === 'impact' ? ' callout-impact' : ''}`}
          style={{ borderTopColor: phase === 'impact' ? flashColor : color, color: phase === 'impact' ? flashColor : color }}
          initial={{ x: xInitial, opacity: 0, scale: 0.88 }}
          animate={phase === 'impact' ? { x: 0, opacity: 1, scale: 1.08 } : { x: 0, opacity: 1, scale: 1 }}
          exit={{ x: xInitial, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        >
          <span className="callout-icon">{MOVE_ICONS[move] || '--'}</span>
          {move.toUpperCase()}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CenterTelemetry({ phase, impact }) {
  const phaseLabel = phase === 'impact'
    ? impact?.isCounter ? 'COUNTER HIT'
      : impact?.isUppercut ? 'UPPERCUT IMPACT'
      : impact?.intensity >= 20 ? 'HEAVY IMPACT'
      : 'CLEAN HIT'
    : phase === 'anticipation'
      ? 'READING THE EXCHANGE'
      : phase === 'recovery'
        ? 'RESETTING FOOTWORK'
        : phase === 'reposition'
          ? 'BACK TO RANGE'
          : 'LIVE FEED'

  const valueLabel = impact?.isCounter
    ? 'PUNISHED STARTUP'
    : impact?.isUppercut
      ? `${impact.intensity || 0} DMG`
      : impact?.intensity
        ? `${impact.intensity} DMG`
        : 'NO DAMAGE'
  const toneClass = impact?.isCounter
    ? 'center-telemetry-red'
    : impact?.isUppercut
      ? 'center-telemetry-gold'
      : impact?.isHook
        ? 'center-telemetry-red'
        : impact?.move === 'jab'
          ? 'center-telemetry-blue'
          : ''

  return (
    <motion.div
      className={`center-telemetry ${toneClass}`.trim()}
      animate={phase === 'impact' ? { scale: impact?.isUppercut ? 1.08 : 1.04, opacity: 1 } : { scale: 1, opacity: 0.9 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
    >
      <span className="center-telemetry-phase">{phaseLabel}</span>
      <span className="center-telemetry-value">{valueLabel}</span>
    </motion.div>
  )
}

function hpColor(hp) {
  if (hp > 50) return '#e84b4b'
  if (hp > 25) return '#e88020'
  return '#ff3d2e'
}
