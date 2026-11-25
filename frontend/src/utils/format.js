const IST = 'Asia/Kolkata'

export const mealNames = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  })
}

// "2026-11-26" -> "Today", "Tomorrow" or "Sat 28 Nov"
export function dayLabel(dateStr) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: IST })
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: IST })
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: IST })

  const pretty = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  if (dateStr === today) return `Today · ${pretty}`
  if (dateStr === tomorrow) return `Tomorrow · ${pretty}`
  if (dateStr === yesterday) return `Yesterday · ${pretty}`
  return pretty
}

// "in 2h 15m" style countdown
export function timeLeft(iso) {
  const mins = Math.round((new Date(iso) - Date.now()) / 60000)
  if (mins <= 0) return 'closed'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`
  return m ? `in ${h}h ${m}m` : `in ${h}h`
}

export function groupByDate(rows) {
  const groups = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.date === row.date) last.items.push(row)
    else groups.push({ date: row.date, items: [row] })
  }
  return groups
}
