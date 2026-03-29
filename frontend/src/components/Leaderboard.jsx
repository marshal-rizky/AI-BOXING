import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchLeaderboard } from '../lib/api.js'

const COLUMNS = [
  { key: 'rank', label: '#', sortable: false },
  { key: 'display_name', label: 'FIGHTER', sortable: true },
  { key: 'record', label: 'W-L-D', sortable: false },
  { key: 'win_rate', label: 'WIN%', sortable: true },
  { key: 'ko_rate', label: 'KO%', sortable: true },
  { key: 'avg_damage', label: 'AVG DMG', sortable: true },
  { key: 'total_fights', label: 'FIGHTS', sortable: true },
]

export function Leaderboard({ onSelectFighter }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('wins')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    fetchLeaderboard()
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function handleSort(key) {
    if (!COLUMNS.find(c => c.key === key)?.sortable) return
    if (key === sortKey) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...data].sort((a, b) => {
    let va = a[sortKey] ?? 0
    let vb = b[sortKey] ?? 0
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sortAsc ? -1 : 1
    if (va > vb) return sortAsc ? 1 : -1
    return 0
  })

  if (loading) {
    return (
      <div className="leaderboard">
        <h2 className="leaderboard-title">GLOBAL LEADERBOARD</h2>
        <div className="leaderboard-loading">Loading rankings...</div>
      </div>
    )
  }

  return (
    <motion.div
      className="leaderboard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="leaderboard-title">GLOBAL LEADERBOARD</h2>
      <div className="leaderboard-table-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  className={`lb-th ${col.sortable ? 'sortable' : ''} ${sortKey === col.key ? 'active' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && <span className="sort-arrow">{sortAsc ? ' \u25B2' : ' \u25BC'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((f, i) => (
              <motion.tr
                key={f.id}
                className={`lb-row ${i === 0 ? 'lb-row-first' : ''}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <td className="lb-rank">{i + 1}</td>
                <td className="lb-name">
                  <button className="lb-name-btn" onClick={() => onSelectFighter(f.id)}>
                    {f.display_name}
                  </button>
                  <span className="lb-provider">{f.provider}</span>
                </td>
                <td className="lb-record">
                  <span className="lb-w">{f.wins}</span>-
                  <span className="lb-l">{f.losses}</span>-
                  <span className="lb-d">{f.draws}</span>
                </td>
                <td className="lb-pct">{(f.win_rate * 100).toFixed(1)}%</td>
                <td className="lb-pct">{(f.ko_rate * 100).toFixed(1)}%</td>
                <td className="lb-num">{f.avg_damage}</td>
                <td className="lb-num">{f.total_fights}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && (
        <div className="leaderboard-empty">No fights recorded yet. Start a fight to populate the leaderboard.</div>
      )}
    </motion.div>
  )
}
