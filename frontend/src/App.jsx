import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Arena } from './components/Arena.jsx'
import { HUD } from './components/HUD.jsx'
import { Controls } from './components/Controls.jsx'
import { Commentary } from './components/Commentary.jsx'
import { ResultOverlay } from './components/ResultOverlay.jsx'
import { FightStats } from './components/FightStats.jsx'
import { bellRing, resumeAudio } from './lib/audio.js'
import { FightLauncher } from './components/FightLauncher.jsx'
import { ThoughtPanel } from './components/ThoughtPanel.jsx'
import { Leaderboard } from './components/Leaderboard.jsx'
import { FighterProfile } from './components/FighterProfile.jsx'
import { apiUrl } from './lib/api.js'

const BASE_SPEED = 1500

function createOverlayCue(kind, label, tone = 'gold') {
  return {
    id: `${kind}-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    label,
    tone,
  }
}

export default function App() {
  const [fightLog, setFightLog] = useState(null)
  const [roundIdx, setRoundIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(BASE_SPEED)
  const [showResult, setShowResult] = useState(false)
  const [commentary, setCommentary] = useState('Load a fight log to begin.')
  const [highlightMode, setHighlightMode] = useState(true)
  const [phase, setPhase] = useState('idle')
  const [impactState, setImpactState] = useState({ intensity: 0, move: null, fighter: null, isCounter: false, isUppercut: false })
  const [overlayCue, setOverlayCue] = useState(createOverlayCue('title', 'ARCADE MODE', 'gold'))
  const [reducedMotion, setReducedMotion] = useState(false)
  const [showThoughts, setShowThoughts] = useState(true)
  const [view, setView] = useState('arena')  // 'arena' | 'leaderboard' | 'profile'
  const [selectedFighter, setSelectedFighter] = useState(null)
  const [fighterNames, setFighterNames] = useState({})  // id -> display_name map

  const playTimerRef = useRef(null)
  const impactTimerRef = useRef(null)
  const cueTimerRef = useRef(null)
  const cueSequenceRef = useRef(0)
  const playbackTokenRef = useRef(0)
  const lastCompletedRoundRef = useRef(-1)
  const lastDelayRef = useRef(0)

  const rounds = fightLog?.rounds || []
  const meta = fightLog?.metadata || {}
  const maxRounds = meta.config?.max_rounds || 12
  const currentRound = roundIdx >= 0 ? rounds[roundIdx] : null
  const roundNumber = currentRound?.round_number || 0

  const f1Name = meta.fighter1_config?.display_name || 'FIGHTER 1'
  const f2Name = meta.fighter2_config?.display_name || 'FIGHTER 2'

  const f1Build = meta.fighter1_build || {}
  const f2Build = meta.fighter2_build || {}

  const f1Stats = currentRound ? {
    name: f1Name,
    hp: currentRound.fighter1.hp_after,
    st: currentRound.fighter1.stamina_after,
    perks: f1Build.perks || [],
  } : { name: f1Name, hp: 100, st: 100, perks: f1Build.perks || [] }

  const f2Stats = currentRound ? {
    name: f2Name,
    hp: currentRound.fighter2.hp_after,
    st: currentRound.fighter2.stamina_after,
    perks: f2Build.perks || [],
  } : { name: f2Name, hp: 100, st: 100, perks: f2Build.perks || [] }

  const moves = currentRound ? {
    f1: currentRound.fighter1.move_executed,
    f2: currentRound.fighter2.move_executed,
  } : null

  function clearPlayTimer() {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current)
      playTimerRef.current = null
    }
  }

  function clearCueTimer() {
    cueSequenceRef.current += 1
    clearTimeout(cueTimerRef.current)
    cueTimerRef.current = null
  }

  function queueCue(cue, duration = 900) {
    clearTimeout(cueTimerRef.current)
    setOverlayCue(cue)
    cueTimerRef.current = setTimeout(() => setOverlayCue(null), duration)
  }

  const loadFightLog = useCallback((data) => {
    clearPlayTimer()
    clearCueTimer()
    playbackTokenRef.current += 1
    lastCompletedRoundRef.current = -1
    lastDelayRef.current = 0
    setFightLog(data)
    setRoundIdx(-1)
    setIsPlaying(false)
    setShowResult(false)
    setPhase('idle')
    setImpactState({ intensity: 0, move: null, fighter: null, isCounter: false, isUppercut: false })
    setOverlayCue(createOverlayCue('title', 'READY FOR THE NEXT BOUT', 'gold'))
    setCommentary(`Fight loaded - ${(data.rounds || []).length} rounds - Press play to start the replay.`)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(media.matches)
    apply()
    media.addEventListener?.('change', apply)
    return () => media.removeEventListener?.('change', apply)
  }, [])

  // Load fighter name map for profiles
  useEffect(() => {
    fetch(apiUrl('/api/fighters'))
      .then(r => r.json())
      .then(data => {
        const names = {}
        for (const [key, val] of Object.entries(data)) {
          names[key] = val.display_name
        }
        setFighterNames(names)
      })
      .catch(() => {})
  }, [])

  function navigateToFighter(id) {
    setSelectedFighter(id)
    setView('profile')
  }

  useEffect(() => {
    fetch(apiUrl('/fight_log.json'))
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(loadFightLog)
      .catch(e => setCommentary(`Could not load fight_log.json (${e}). Use LOAD LOG to pick a file.`))
  }, [loadFightLog])

  useEffect(() => {
    if (!fightLog) return
    if (!currentRound) {
      setCommentary(`Fight loaded - ${rounds.length} rounds - Press play to start the replay.`)
      setPhase('idle')
      return
    }

    setCommentary(currentRound.commentary || 'No commentary for this exchange.')
  }, [fightLog, currentRound, rounds.length])

  useEffect(() => {
    return () => {
      clearPlayTimer()
      clearCueTimer()
      clearTimeout(impactTimerRef.current)
    }
  }, [])

  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault()
          handlePlay()
          break
        case 'ArrowRight':
        case 'KeyL':
          handleNext()
          break
        case 'ArrowLeft':
        case 'KeyJ':
          handlePrev()
          break
        case 'KeyR':
          handleRestart()
          break
        case 'KeyH':
          setHighlightMode(prev => !prev)
          break
        case 'KeyT':
          setShowThoughts(prev => !prev)
          break
        case 'Digit1':
          setSpeed(3000)
          break
        case 'Digit2':
          setSpeed(1500)
          break
        case 'Digit3':
          setSpeed(900)
          break
        case 'Digit4':
          setSpeed(600)
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  function showRoundStartCue(index) {
    const round = rounds[index]
    if (!round) return

    const seq = ++cueSequenceRef.current
    queueCue(createOverlayCue('round', `ROUND ${round.round_number}`, 'gold'), 820)
    cueTimerRef.current = window.setTimeout(() => {
      if (cueSequenceRef.current !== seq) return
      queueCue(createOverlayCue('fight', index === rounds.length - 1 ? 'FINAL EXCHANGE' : 'FIGHT', 'red'), 620)
    }, 250)
  }

  function scheduleNextAfter(ms) {
    clearPlayTimer()
    const token = playbackTokenRef.current
    playTimerRef.current = setTimeout(() => {
      if (token !== playbackTokenRef.current) return
      setRoundIdx(prev => {
        const next = prev + 1
        if (next >= rounds.length) {
          setIsPlaying(false)
          bellRing()
          queueCue(createOverlayCue('result', 'KO SCREEN', 'red'), 700)
          setShowResult(true)
          return prev
        }
        return next
      })
    }, ms)
  }

  function advanceToRound(index, autoplay = false) {
    if (!fightLog) return
    const clamped = Math.max(-1, Math.min(rounds.length - 1, index))
    clearPlayTimer()
    clearCueTimer()
    playbackTokenRef.current += 1
    lastCompletedRoundRef.current = -1
    lastDelayRef.current = 0
    setShowResult(false)
    setRoundIdx(clamped)

    if (clamped >= 0) {
      showRoundStartCue(clamped)
    }

    if (autoplay) {
      setIsPlaying(true)
    }
  }

  function handlePlay() {
    resumeAudio()
    if (!fightLog) return

    if (isPlaying) {
      clearPlayTimer()
      setIsPlaying(false)
      return
    }

    if (roundIdx === -1) {
      bellRing()
      advanceToRound(0, true)
      return
    }

    if (roundIdx >= rounds.length - 1) {
      setShowResult(false)
      bellRing()
      advanceToRound(0, true)
      return
    }

    if (lastCompletedRoundRef.current === roundIdx && lastDelayRef.current > 0) {
      setIsPlaying(true)
      scheduleNextAfter(lastDelayRef.current)
      return
    }

    setIsPlaying(true)
  }

  function handleNext() {
    resumeAudio()
    if (!fightLog) return
    clearPlayTimer()
    clearCueTimer()
    setIsPlaying(false)

    if (roundIdx < rounds.length - 1) {
      if (roundIdx === -1) bellRing()
      advanceToRound(roundIdx + 1, false)
      return
    }

    bellRing()
    setShowResult(true)
    queueCue(createOverlayCue('result', 'FIGHT OVER', 'red'), 720)
  }

  function handlePrev() {
    if (!fightLog) return
    clearPlayTimer()
    clearCueTimer()
    setIsPlaying(false)
    setShowResult(false)

    if (roundIdx > 0) {
      advanceToRound(roundIdx - 1, false)
    } else {
      playbackTokenRef.current += 1
      lastCompletedRoundRef.current = -1
      lastDelayRef.current = 0
      setRoundIdx(-1)
      setPhase('idle')
      setCommentary('Press play to start the replay.')
      setOverlayCue(createOverlayCue('title', 'REPLAY READY', 'gold'))
    }
  }

  function handleRestart() {
    clearPlayTimer()
    clearCueTimer()
    playbackTokenRef.current += 1
    lastCompletedRoundRef.current = -1
    lastDelayRef.current = 0
    setIsPlaying(false)
    setShowResult(false)
    setRoundIdx(-1)
    setPhase('idle')
    setCommentary('Press play to start the replay.')
    queueCue(createOverlayCue('title', 'ROUND RESET', 'gold'), 720)
  }

  function handleSeek(idx) {
    if (!fightLog) return
    clearPlayTimer()
    clearCueTimer()
    setIsPlaying(false)
    advanceToRound(idx, false)
  }

  function handleLoadFile(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        loadFightLog(JSON.parse(ev.target.result))
      } catch (err) {
        setCommentary(`Invalid file: ${err.message}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handlePhaseChange(nextPhase) {
    setPhase(nextPhase)
  }

  function handleImpact(payload) {
    clearTimeout(impactTimerRef.current)
    setImpactState(payload)
    if (payload.isCounter) {
      queueCue(createOverlayCue('impact', 'COUNTER HIT', 'red'), 320)
    } else if (payload.isUppercut && payload.intensity >= 20) {
      queueCue(createOverlayCue('impact', 'UPPERCUT', 'gold'), 320)
    } else if (payload.isHook && payload.intensity >= 15) {
      queueCue(createOverlayCue('impact', 'HOOK SHOT', 'red'), 280)
    }
    impactTimerRef.current = setTimeout(() => {
      setImpactState({ intensity: 0, move: null, fighter: null, isCounter: false, isUppercut: false })
    }, 280)
  }

  function handleAnimationComplete(metaData) {
    const isLastRound = roundIdx >= rounds.length - 1
    const paceScale = speed / BASE_SPEED
    const holdMs = Math.max(180, Math.round(metaData.recommendedDelay * paceScale))
    lastCompletedRoundRef.current = roundIdx
    lastDelayRef.current = holdMs

    if (isLastRound) {
      if (isPlaying) {
        clearPlayTimer()
        playTimerRef.current = setTimeout(() => {
          setIsPlaying(false)
          bellRing()
          queueCue(createOverlayCue('result', metaData.finisherLabel || 'FIGHT OVER', metaData.maxDamage >= 20 ? 'red' : 'gold'), 900)
          setShowResult(true)
        }, holdMs)
      }
      return
    }

    if (isPlaying) {
      scheduleNextAfter(holdMs)
    }
  }

  const lowHealth = {
    f1: f1Stats.hp <= 25,
    f2: f2Stats.hp <= 25,
  }

  const sceneTone = impactState.isUppercut && impactState.intensity >= 20
    ? 'critical'
    : impactState.isCounter
      ? 'hot'
      : impactState.intensity >= 20
        ? 'critical'
        : phase === 'impact'
          ? 'hot'
          : 'default'

  return (
    <div id="app" className={`scene-tone-${sceneTone}`} onClick={resumeAudio}>
      <header>
        <div className="header-left">
          <div className="logo-mark">[]</div>
          <span className="logo-text">AI BOXING</span>
          <nav className="header-nav">
            <button
              className={`nav-tab ${view === 'arena' ? 'nav-tab-active' : ''}`}
              onClick={() => setView('arena')}
            >
              ARENA
            </button>
            <button
              className={`nav-tab ${view === 'leaderboard' || view === 'profile' ? 'nav-tab-active' : ''}`}
              onClick={() => setView('leaderboard')}
            >
              LEADERBOARD
            </button>
          </nav>
        </div>

        {view === 'arena' && (
          <motion.div
            id="fight-title"
            className="fight-title"
            key={`${f1Name}-${f2Name}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {f1Name} VS {f2Name}
          </motion.div>
        )}

        <div className="header-right">
          {view === 'arena' && (
            <button
              className="btn-secondary"
              onClick={() => document.getElementById('log-file-input').click()}
            >
              LOAD LOG
            </button>
          )}
        </div>
      </header>

      {view === 'leaderboard' && (
        <Leaderboard onSelectFighter={navigateToFighter} />
      )}

      {view === 'profile' && selectedFighter && (
        <FighterProfile
          fighterId={selectedFighter}
          onBack={() => setView('leaderboard')}
          onSelectFighter={navigateToFighter}
          fighterNames={fighterNames}
        />
      )}

      {view === 'arena' && <><div className="arena-row">
        <AnimatePresence>
          {showThoughts && (
            <ThoughtPanel
              key="thought-left"
              reasoning={currentRound?.fighter1?.reasoning}
              name={f1Name}
              side="left"
              color="#ef5454"
              moveChosen={currentRound?.fighter1?.move_chosen}
              moveExecuted={currentRound?.fighter1?.move_executed}
              roundNum={roundNumber}
            />
          )}
        </AnimatePresence>

        <div className="arena-col">
          <div className="arena-stack">
            <Arena
              round={currentRound}
              distBefore={currentRound?.distance_before ?? 1}
              distAfter={currentRound?.distance_after ?? 1}
              reducedMotion={reducedMotion}
              highlightMode={highlightMode}
              lowHealth={lowHealth}
              onPhaseChange={handlePhaseChange}
              onImpact={handleImpact}
              onAnimComplete={handleAnimationComplete}
            />

            <HUD
              f1={f1Stats}
              f2={f2Stats}
              roundNum={roundNumber}
              maxRounds={maxRounds}
              distance={currentRound?.distance_after ?? 1}
              moves={moves}
              phase={phase}
              impact={impactState}
              cue={overlayCue}
              lowHealth={lowHealth}
            />
          </div>

          <Commentary
            text={commentary}
            phase={phase}
            impact={impactState}
            highlightMode={highlightMode}
          />

          <FightStats
            rounds={rounds}
            roundIdx={roundIdx}
            f1Name={f1Name}
            f2Name={f2Name}
            phase={phase}
          />
        </div>

        <AnimatePresence>
          {showThoughts && (
            <ThoughtPanel
              key="thought-right"
              reasoning={currentRound?.fighter2?.reasoning}
              name={f2Name}
              side="right"
              color="#52a5ff"
              moveChosen={currentRound?.fighter2?.move_chosen}
              moveExecuted={currentRound?.fighter2?.move_executed}
              roundNum={roundNumber}
            />
          )}
        </AnimatePresence>
      </div>

      <Controls
        isPlaying={isPlaying}
        hasFight={!!fightLog}
        roundIdx={roundIdx}
        totalRounds={rounds.length}
        onPlay={handlePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onRestart={handleRestart}
        onSeek={handleSeek}
        speed={speed}
        onSpeedChange={setSpeed}
        onLoadFile={handleLoadFile}
        highlightMode={highlightMode}
        onToggleHighlight={() => setHighlightMode(prev => !prev)}
        showThoughts={showThoughts}
        onToggleThoughts={() => setShowThoughts(prev => !prev)}
      />

      <FightLauncher onFightComplete={loadFightLog} />

      {showResult && (
        <ResultOverlay
          result={fightLog?.result}
          meta={meta}
          onClose={() => setShowResult(false)}
          onSelectFighter={navigateToFighter}
          fighterNames={fighterNames}
        />
      )}
      </>}
    </div>
  )
}
