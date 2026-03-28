import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CHAR_DELAY = 12 // ms per character

export function ThoughtPanel({ reasoning, name, side, color, moveChosen, moveExecuted, roundNum }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const containerRef = useRef(null)
  const timerRef = useRef(null)

  const text = reasoning || ''
  const forced = moveChosen && moveExecuted && moveChosen !== moveExecuted

  useEffect(() => {
    clearInterval(timerRef.current)
    setDisplayed('')
    setDone(false)

    if (!text) {
      setDone(true)
      return
    }

    let i = 0
    timerRef.current = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(timerRef.current)
        setDone(true)
      }
    }, CHAR_DELAY)

    return () => clearInterval(timerRef.current)
  }, [text, roundNum])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [displayed])

  const isLeft = side === 'left'

  return (
    <motion.div
      className={`thought-panel thought-panel-${side}`}
      initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isLeft ? -20 : 20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="thought-header" style={{ color }}>
        <span className="thought-icon">{'{ }'}</span>
        <span className="thought-name">{name}</span>
      </div>

      {roundNum > 0 && (
        <div className="thought-round">ROUND {roundNum}</div>
      )}

      {forced && (
        <div className="thought-forced">
          FORCED: {moveChosen.toUpperCase()} → {moveExecuted.toUpperCase()}
        </div>
      )}

      <div className="thought-body" ref={containerRef}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${roundNum}-${side}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {text ? (
              <p className="thought-text">
                {displayed}
                {!done && <span className="thought-cursor">_</span>}
              </p>
            ) : (
              <p className="thought-empty">
                {roundNum > 0 ? 'No reasoning provided.' : 'Waiting for the fight to begin...'}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
