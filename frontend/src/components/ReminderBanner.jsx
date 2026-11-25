import { useEffect, useState } from 'react'
import { api } from '../api'
import { formatTime, mealNames } from '../utils/format'

const CHECK_EVERY = 5 * 60 * 1000

// shows unmarked meals that close soon, and a browser notification once per meal
export default function ReminderBanner({ refreshKey }) {
  const [reminders, setReminders] = useState([])
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  )

  useEffect(() => {
    function check() {
      api('/meal-marks/reminders')
        .then((rows) => {
          setReminders(rows)
          notify(rows)
        })
        .catch(() => {})
    }
    check()
    const timer = setInterval(check, CHECK_EVERY)
    return () => clearInterval(timer)
  }, [refreshKey])

  function notify(rows) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const shown = JSON.parse(localStorage.getItem('notified') || '[]')
    for (const r of rows) {
      if (shown.includes(r.slot_id)) continue
      new Notification('MessMind', {
        body: `Will you eat ${mealNames[r.type].toLowerCase()}? Marking closes at ${formatTime(r.marking_closes_at)}.`,
      })
      shown.push(r.slot_id)
    }
    localStorage.setItem('notified', JSON.stringify(shown.slice(-30)))
  }

  async function enableNotifications() {
    setPermission(await Notification.requestPermission())
  }

  if (reminders.length === 0) return null

  return (
    <div className="reminder">
      <strong>Not marked yet:</strong>{' '}
      {reminders
        .map((r) => `${mealNames[r.type]} (closes ${formatTime(r.marking_closes_at)})`)
        .join(', ')}
      {permission === 'default' && (
        <button className="secondary small" onClick={enableNotifications}>
          Remind me with notifications
        </button>
      )}
    </div>
  )
}
