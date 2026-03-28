import { motion, AnimatePresence } from 'framer-motion'

export function Commentary({ text, phase, impact, highlightMode }) {
  const tone = impact?.isUppercut && impact?.intensity >= 20
    ? 'critical'
    : impact?.isCounter || phase === 'impact'
      ? 'hot'
      : 'default'
  const metaLabel = highlightMode ? 'Arcade replay pacing' : 'Standard pacing'
  const phaseLabel = impact?.isCounter
    ? 'COUNTER'
    : impact?.isUppercut
      ? 'UPPERCUT'
      : phase.toUpperCase()

  return (
    <div id="commentary-strip" className={`commentary-${tone}`}>
      <div className="commentary-meta">
        <span className="commentary-icon">{'>'}</span>
        <span className="commentary-phase">{phaseLabel}</span>
        <span className="commentary-mode">{metaLabel}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          id="commentary-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
