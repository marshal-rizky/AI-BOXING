import { motion, AnimatePresence } from 'framer-motion'

const MOVE_COLORS = {
  jab: '#e84b4b', hook: '#e88020', uppercut: '#e8b84b',
  dodge: '#4b9ee8', clinch: '#9b59b6', rest: '#666680',
}

export function FightStats({ rounds, roundIdx, f1Name, f2Name, phase }) {
  if (!rounds || rounds.length === 0 || roundIdx < 0) return null

  const visibleRounds = rounds.slice(0, roundIdx + 1)

  let f1DmgDealt = 0, f2DmgDealt = 0
  let f1Dodges = 0, f2Dodges = 0

  visibleRounds.forEach(r => {
    f1DmgDealt += r.fighter2.damage_taken || 0
    f2DmgDealt += r.fighter1.damage_taken || 0
    if (r.fighter1.move_executed === 'dodge') f1Dodges++
    if (r.fighter2.move_executed === 'dodge') f2Dodges++
  })

  const last8_f1 = visibleRounds.slice(-8).map(r => r.fighter1.move_executed)
  const last8_f2 = visibleRounds.slice(-8).map(r => r.fighter2.move_executed)

  return (
    <AnimatePresence>
      <motion.div
        id="fight-stats"
        initial={{ opacity: 0, height: 0 }}
        animate={phase === 'impact' ? { opacity: 1, height: 'auto', y: -2 } : { opacity: 1, height: 'auto', y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <div className="stats-header" style={{ color: '#e84b4b' }}>{f1Name}</div>
          <div className="stats-row"><span>DMG DEALT</span><span>{f1DmgDealt}</span></div>
          <div className="stats-row"><span>DODGES</span><span>{f1Dodges}</span></div>
          <div className="move-badges">
            {last8_f1.map((m, i) => (
              <span key={i} className="move-badge" style={{ color: MOVE_COLORS[m] || '#666', borderColor: (MOVE_COLORS[m] || '#666') + '44' }}>
                {m}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="stats-header" style={{ color: '#4b9ee8', textAlign: 'right' }}>{f2Name}</div>
          <div className="stats-row"><span>DMG DEALT</span><span>{f2DmgDealt}</span></div>
          <div className="stats-row"><span>DODGES</span><span>{f2Dodges}</span></div>
          <div className="move-badges" style={{ justifyContent: 'flex-end' }}>
            {last8_f2.map((m, i) => (
              <span key={i} className="move-badge" style={{ color: MOVE_COLORS[m] || '#666', borderColor: (MOVE_COLORS[m] || '#666') + '44' }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
