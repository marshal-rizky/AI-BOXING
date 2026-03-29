const API_BASE = import.meta.env.VITE_API_URL || ''

export const apiUrl = (path) => `${API_BASE}${path}`

export const fetchLeaderboard = () =>
  fetch(apiUrl('/api/leaderboard')).then(r => r.json())

export const fetchFighterProfile = (id) =>
  fetch(apiUrl(`/api/fighter/${id}`)).then(r => r.json())
