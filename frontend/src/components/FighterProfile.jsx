import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchFighterProfile } from '../lib/api.js'

const DISTANCE_LABELS = { outside: 'OUTSIDE', mid: 'MID-RANGE', inside: 'INSIDE' }
const BEHAVIOR_LABELS = { protect: 'Protect Lead', gamble: 'Gamble', pressure: 'Pressure', survive: 'Survive' }

export function FighterProfile({ fighterId, onBack, onSelectFighter, fighterNames }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchFighterProfile(fighterId)
      .then(d => {
        if (d.error) throw new Error(d.error)
        setProfile(d)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [fighterId])

  if (loading) {
    return (
      <div className="fighter-profile">
        <button className="profile-back" onClick={onBack}>&larr; LEADERBOARD</button>
        <div className="profile-loading">Loading profile...</div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="fighter-profile">
        <button className="profile-back" onClick={onBack}>&larr; LEADERBOARD</button>
        <div className="profile-error">Fighter not found.</div>
      </div>
    )
  }

  const s = profile.stats || {}
  const style = profile.style || {}

  return (
    <motion.div
      className="fighter-profile"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button className="profile-back" onClick={onBack}>&larr; LEADERBOARD</button>

      {/* Header */}
      <div className="profile-header">
        <h2 className="profile-name">{profile.display_name}</h2>
        <div className="profile-meta">
          <span className="profile-badge">{profile.provider}</span>
          {profile.model && <span className="profile-badge profile-badge-model">{profile.model}</span>}
        </div>
        {profile.personality && (
          <p className="profile-personality">{profile.personality}</p>
        )}
        {profile.inner_voice && (
          <p className="profile-voice">"{profile.inner_voice}"</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="profile-section">
        <h3 className="profile-section-title">FIGHT RECORD</h3>
        <div className="profile-stats-grid">
          <StatBox label="WINS" value={s.wins} accent="var(--green, #4ade80)" />
          <StatBox label="LOSSES" value={s.losses} accent="var(--red)" />
          <StatBox label="DRAWS" value={s.draws} accent="var(--gold)" />
          <StatBox label="WIN RATE" value={`${(s.win_rate * 100).toFixed(1)}%`} />
          <StatBox label="KO WINS" value={s.ko_wins} />
          <StatBox label="KO RATE" value={`${(s.ko_rate * 100).toFixed(1)}%`} />
          <StatBox label="AVG DAMAGE" value={s.avg_damage} />
          <StatBox label="TOTAL FIGHTS" value={s.total_fights} />
          <StatBox label="TOTAL DODGES" value={s.total_dodges} />
          <StatBox label="TOTAL ROUNDS" value={s.total_rounds} />
          <StatBox label="DAMAGE DEALT" value={s.total_damage_dealt} />
          <StatBox label="DAMAGE TAKEN" value={s.total_damage_taken} />
        </div>
      </div>

      {/* Fighting Style */}
      {style && Object.keys(style).length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">FIGHTING STYLE</h3>
          <div className="profile-style-tags">
            {style.preferred_distance && (
              <span className="style-tag">
                <span className="style-tag-label">RANGE</span>
                {DISTANCE_LABELS[style.preferred_distance] || style.preferred_distance}
              </span>
            )}
            {style.when_ahead && (
              <span className="style-tag">
                <span className="style-tag-label">WHEN AHEAD</span>
                {BEHAVIOR_LABELS[style.when_ahead] || style.when_ahead}
              </span>
            )}
            {style.when_behind && (
              <span className="style-tag">
                <span className="style-tag-label">WHEN BEHIND</span>
                {BEHAVIOR_LABELS[style.when_behind] || style.when_behind}
              </span>
            )}
            {style.low_stamina && (
              <span className="style-tag">
                <span className="style-tag-label">LOW STAMINA</span>
                {style.low_stamina === 'push_through' ? 'Push Through' : 'Rest & Wait'}
              </span>
            )}
            <span className="style-tag">
              <span className="style-tag-label">READS OPPONENT</span>
              {style.reads_opponent ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      )}

      {/* Win Method Breakdown */}
      {s.total_fights > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">WIN METHODS</h3>
          <div className="profile-methods">
            <MethodBar label="KO" value={s.ko_wins} total={s.wins || 1} color="#ef5454" />
            <MethodBar label="TKO" value={s.tko_wins} total={s.wins || 1} color="#f3c356" />
            <MethodBar label="Decision" value={s.decision_wins} total={s.wins || 1} color="#52a5ff" />
          </div>
        </div>
      )}

      {/* Recent Fights */}
      {profile.recent_fights && profile.recent_fights.length > 0 && (
        <div className="profile-section">
          <h3 className="profile-section-title">RECENT FIGHTS</h3>
          <div className="profile-history">
            {profile.recent_fights.map((f, i) => {
              const opponentName = fighterNames?.[f.opponent_id] || f.opponent_id
              return (
                <motion.div
                  key={f.fight_id || i}
                  className={`history-row history-${f.outcome}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <span className={`history-outcome history-outcome-${f.outcome}`}>
                    {f.outcome === 'win' ? 'W' : f.outcome === 'loss' ? 'L' : 'D'}
                  </span>
                  <span className="history-vs">vs</span>
                  <button className="history-opponent" onClick={() => onSelectFighter?.(f.opponent_id)}>
                    {opponentName}
                  </button>
                  <span className="history-method">{f.method}</span>
                  <span className="history-rounds">R{f.rounds}</span>
                  <span className="history-dmg">{f.damage_dealt} dmg</span>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function StatBox({ label, value, accent }) {
  return (
    <div className="stat-box">
      <div className="stat-box-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-box-label">{label}</div>
    </div>
  )
}

function MethodBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="method-bar-row">
      <span className="method-label">{label}</span>
      <div className="method-bar-track">
        <div className="method-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="method-count">{value}</span>
    </div>
  )
}
