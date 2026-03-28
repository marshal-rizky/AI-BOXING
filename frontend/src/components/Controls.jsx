import { motion } from 'framer-motion'

const SPEEDS = [
  { value: 3000, label: '0.5x' },
  { value: 1500, label: '1x' },
  { value: 900, label: '1.7x' },
  { value: 600, label: '2.5x' },
]

export function Controls({
  isPlaying, hasFight, roundIdx, totalRounds,
  onPlay, onPrev, onNext, onRestart,
  onSeek, speed, onSpeedChange, onLoadFile,
  highlightMode, onToggleHighlight,
  showThoughts, onToggleThoughts,
}) {
  const progress = totalRounds > 0 ? ((roundIdx + 1) / totalRounds) * 100 : 0

  function handleTrackClick(e) {
    if (!hasFight || totalRounds === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const idx = Math.max(0, Math.min(totalRounds - 1, Math.floor(pct * totalRounds)))
    onSeek(idx)
  }

  return (
    <div id="controls">
      <div className="ctrl-group">
        <button className="ctrl-btn" onClick={onRestart} title="Restart">↺</button>
        <button className="ctrl-btn" onClick={onPrev} title="Previous">◀◀</button>

        <motion.button
          className="ctrl-btn ctrl-play"
          onClick={onPlay}
          whileTap={{ scale: 0.92 }}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </motion.button>

        <button className="ctrl-btn" onClick={onNext} title="Next">▶▶</button>
      </div>

      <div id="timeline-wrap">
        <div id="timeline-track" onClick={handleTrackClick}>
          <motion.div
            id="timeline-fill"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.24, ease: 'linear' }}
          />
        </div>
        <span id="timeline-label">
          {roundIdx >= 0 ? roundIdx + 1 : 0} / {totalRounds}
        </span>
      </div>

      <div className="ctrl-stack">
        <div className="speed-group">
          {SPEEDS.map(s => (
            <button
              key={s.value}
              className={`speed-btn${speed === s.value ? ' active' : ''}`}
              onClick={() => onSpeedChange(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          className={`toggle-chip${highlightMode ? ' active' : ''}`}
          onClick={onToggleHighlight}
          type="button"
        >
          {highlightMode ? 'HIGHLIGHT ON' : 'HIGHLIGHT OFF'}
        </button>

        <button
          className={`toggle-chip${showThoughts ? ' active' : ''}`}
          onClick={onToggleThoughts}
          type="button"
        >
          {showThoughts ? 'THOUGHTS ON' : 'THOUGHTS OFF'}
        </button>
      </div>

      <input
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        id="log-file-input"
        onChange={onLoadFile}
      />
    </div>
  )
}
