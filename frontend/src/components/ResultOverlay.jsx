import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiUrl } from '../lib/api.js'

export function ResultOverlay({ result, meta, onClose }) {
  if (!result) return null

  const f1n = meta?.fighter1_config?.display_name || 'F1'
  const f2n = meta?.fighter2_config?.display_name || 'F2'
  const s1 = result.fighter1_stats || {}
  const s2 = result.fighter2_stats || {}
  const winnerColor = result.winner === f1n ? '#e84b4b' : result.winner === f2n ? '#4b9ee8' : '#e8b84b'

  const [interviewState, setInterviewState] = useState('idle') // idle | loading | done | error
  const [interview, setInterview] = useState(null)

  async function requestInterview() {
    setInterviewState('loading')
    try {
      const res = await fetch(apiUrl('/api/interview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: meta, result }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setInterview(data)
      setInterviewState('done')
    } catch (e) {
      setInterviewState('error')
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        id="result-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          id="result-card"
          initial={{ scale: 0.78, y: 50, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.88, y: 20, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24, delay: 0.04 }}
        >
          <div className="result-glow" />
          <div className="result-scanlines" />

          <motion.div id="result-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            FINAL RESULT
          </motion.div>

          <motion.div
            id="result-winner"
            style={{ color: winnerColor }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.24 }}
          >
            {result.winner ? `${result.winner} WINS` : 'DRAW'}
          </motion.div>

          <motion.div id="result-method" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}>
            {`by ${result.method} · ${result.rounds_fought} round${result.rounds_fought !== 1 ? 's' : ''}`}
          </motion.div>

          <div id="result-divider" />

          <motion.div id="result-stats" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}>
            <StatLine name={f1n} stats={s1} color="#e84b4b" />
            <StatLine name={f2n} stats={s2} color="#4b9ee8" />
            {result.final_score && (
              <div className="result-score-row">
                Score {result.final_score.fighter1} - {result.final_score.fighter2}
              </div>
            )}
          </motion.div>

          {(meta?.fighter1_build || meta?.fighter2_build) && (
            <motion.div className="result-builds" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.56 }}>
              <div className="result-builds-title">AI BUILD CHOICES</div>
              <BuildLine name={f1n} build={meta.fighter1_build} color="#e84b4b" />
              <BuildLine name={f2n} build={meta.fighter2_build} color="#4b9ee8" />
            </motion.div>
          )}

          {/* Post-fight interview section */}
          <motion.div className="interview-section" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66 }}>
            {interviewState === 'idle' && (
              <button className="interview-btn" onClick={requestInterview}>
                🎤 POST-FIGHT INTERVIEW
              </button>
            )}

            {interviewState === 'loading' && (
              <div className="interview-loading">
                <span className="interview-loading-dot" />
                <span className="interview-loading-dot" />
                <span className="interview-loading-dot" />
                <span className="interview-loading-label">Calling fighters to the mic...</span>
              </div>
            )}

            {interviewState === 'error' && (
              <div className="interview-error">
                Could not reach the fighters. Check your API keys and try again.
                <button className="interview-retry" onClick={requestInterview}>Retry</button>
              </div>
            )}

            {interviewState === 'done' && interview && (
              <AnimatePresence>
                <motion.div
                  className="interview-responses"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="interview-title">🎤 POST-FIGHT INTERVIEW</div>
                  <InterviewCard
                    name={interview.fighter1?.name}
                    response={interview.fighter1?.response}
                    color="#e84b4b"
                    isWinner={result.winner === interview.fighter1?.name}
                    error={interview.fighter1?.error}
                  />
                  <InterviewCard
                    name={interview.fighter2?.name}
                    response={interview.fighter2?.response}
                    color="#4b9ee8"
                    isWinner={result.winner === interview.fighter2?.name}
                    error={interview.fighter2?.error}
                  />
                </motion.div>
              </AnimatePresence>
            )}
          </motion.div>

          <motion.button
            id="btn-close-result"
            onClick={onClose}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.58 }}
          >
            CLOSE
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function InterviewCard({ name, response, color, isWinner, error }) {
  return (
    <motion.div
      className="interview-card"
      style={{ borderLeftColor: color }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="interview-card-header">
        <span className="interview-card-name" style={{ color }}>{name}</span>
        {isWinner && <span className="interview-winner-badge">WINNER</span>}
        {error && <span className="interview-error-badge">API ERROR</span>}
      </div>
      <p className="interview-card-text">"{response}"</p>
    </motion.div>
  )
}

function StatLine({ name, stats, color }) {
  return (
    <div className="result-stat-line">
      <span style={{ color }}>{name}</span>
      <span>{stats.total_damage_dealt ?? '--'} dmg</span>
      <span>{stats.successful_dodges ?? 0} dodges</span>
      <span>{stats.api_errors ?? 0} API errors</span>
    </div>
  )
}

function BuildLine({ name, build, color }) {
  if (!build || !build.points) return null
  const pts = build.points
  const perks = build.perks || []
  return (
    <div className="result-build-line">
      <span className="result-build-name" style={{ color }}>{name}</span>
      <div className="result-build-points">
        {pts.hp > 0 && <span className="build-point">HP+{pts.hp * 5}</span>}
        {pts.stamina > 0 && <span className="build-point">ST+{pts.stamina * 5}</span>}
        {pts.power > 0 && <span className="build-point">PWR+{pts.power * 2}%</span>}
        {pts.endurance > 0 && <span className="build-point">END+{pts.endurance * 2}%</span>}
      </div>
      {perks.length > 0 && (
        <div className="result-build-perks">
          {perks.map(p => <span key={p} className="result-perk-tag">{p}</span>)}
        </div>
      )}
      {build.reasoning && (
        <div className="result-build-reasoning">"{build.reasoning}"</div>
      )}
    </div>
  )
}
