import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { apiUrl } from '../lib/api.js'

const CUSTOM_ROUND_LIMIT = 999

export function FightLauncher({ onFightComplete }) {
  const [fighters, setFighters] = useState({})
  const [f1, setF1] = useState('llama')
  const [f2, setF2] = useState('cerebras')
  const [rounds, setRounds] = useState(6)
  const [roundMode, setRoundMode] = useState('preset')
  const [customRounds, setCustomRounds] = useState('6')
  const [koOnly, setKoOnly] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(apiUrl('/api/fighters'))
      .then(r => r.json())
      .then(data => setFighters(data))
      .catch(() => {})
  }, [])

  const keys = Object.keys(fighters)
  const isRunning = status === 'running'
  const invalidMatchup = f1 === f2
  const roundCount = roundMode === 'custom' ? Number(customRounds) : rounds
  const invalidRounds =
    !koOnly &&
    (!Number.isInteger(roundCount) || roundCount < 1 || roundCount > CUSTOM_ROUND_LIMIT)

  async function handleStart() {
    if (invalidMatchup) {
      setStatus('error')
      setError('Choose two different fighters.')
      return
    }

    if (invalidRounds) {
      setStatus('error')
      setError(`Rounds must be between 1 and ${CUSTOM_ROUND_LIMIT}.`)
      return
    }

    setStatus('running')
    setError(null)

    try {
      const res = await fetch(apiUrl('/api/fight'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fighter1: f1,
          fighter2: f2,
          rounds: roundCount,
          ko_only: koOnly,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`)
      }
      setStatus('idle')
      onFightComplete(data)
    } catch (e) {
      setStatus('error')
      setError(e.message)
    }
  }

  function handleRoundsPresetChange(value) {
    if (value === 'ko') {
      setKoOnly(true)
      setRoundMode('preset')
      return
    }

    if (value === 'custom') {
      setKoOnly(false)
      setRoundMode('custom')
      return
    }

    setKoOnly(false)
    setRoundMode('preset')
    setRounds(Number(value))
  }

  return (
    <div id="fight-launcher">
      <div className="launcher-label">NEW FIGHT</div>
      <div className="launcher-selects">
        <select
          className="launcher-select"
          value={f1}
          onChange={e => setF1(e.target.value)}
          disabled={isRunning}
        >
          {keys.map(k => (
            <option key={k} value={k}>{fighters[k].display_name}</option>
          ))}
        </select>

        <span className="launcher-vs">VS</span>

        <select
          className="launcher-select"
          value={f2}
          onChange={e => setF2(e.target.value)}
          disabled={isRunning}
        >
          {keys.map(k => (
            <option key={k} value={k}>{fighters[k].display_name}</option>
          ))}
        </select>

        <select
          className="launcher-select launcher-rounds"
          value={koOnly ? 'ko' : roundMode === 'custom' ? 'custom' : String(rounds)}
          onChange={e => handleRoundsPresetChange(e.target.value)}
          disabled={isRunning}
        >
          <option value="3">3 RDS</option>
          <option value="6">6 RDS</option>
          <option value="12">12 RDS</option>
          <option value="custom">CUSTOM</option>
          <option value="ko">KO ONLY</option>
        </select>

        {roundMode === 'custom' && !koOnly && (
          <input
            className="launcher-select launcher-round-input"
            type="number"
            min="1"
            max={String(CUSTOM_ROUND_LIMIT)}
            step="1"
            inputMode="numeric"
            value={customRounds}
            onChange={e => setCustomRounds(e.target.value)}
            disabled={isRunning}
            placeholder="ROUNDS"
            aria-label="Custom rounds"
          />
        )}
      </div>

      <motion.button
        id="btn-start-fight"
        onClick={handleStart}
        disabled={isRunning || keys.length === 0 || invalidMatchup || invalidRounds}
        whileTap={{ scale: 0.95 }}
      >
        {isRunning ? 'FIGHTING...' : 'START FIGHT'}
      </motion.button>

      <AnimatePresence>
        {(invalidMatchup || invalidRounds || (status === 'error' && error)) && (
          <motion.div
            className="launcher-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {invalidMatchup
              ? 'Choose two different fighters.'
              : invalidRounds
                ? `Rounds must be between 1 and ${CUSTOM_ROUND_LIMIT}.`
                : error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
