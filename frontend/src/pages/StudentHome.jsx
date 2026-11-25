import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import MealCard from '../components/MealCard'
import ReminderBanner from '../components/ReminderBanner'
import { dayLabel, groupByDate } from '../utils/format'
import './StudentHome.css'

export default function StudentHome() {
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [changes, setChanges] = useState(0)

  useEffect(() => {
    api('/meal-marks/upcoming')
      .then(setMeals)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // every minute: update countdowns and lock meals whose cut-off has passed
  useEffect(() => {
    const timer = setInterval(() => {
      setMeals((current) =>
        current.map((m) =>
          m.is_open && new Date(m.marking_closes_at) <= Date.now() ? { ...m, is_open: false } : { ...m }
        )
      )
    }, 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // eating = true / false, or null to clear
  async function handleChange(meal, eating) {
    setError('')
    setSavingId(meal.slot_id)
    const before = meals
    setMeals(meals.map((m) => (m.slot_id === meal.slot_id ? { ...m, intent_to_eat: eating } : m)))
    try {
      if (eating === null) {
        await api(`/meal-marks/${meal.slot_id}`, { method: 'DELETE' })
      } else {
        await api(`/meal-marks/${meal.slot_id}`, { method: 'PUT', body: { eating } })
      }
      setChanges((c) => c + 1)
    } catch (err) {
      setMeals(before)
      setError(err.message)
      // the meal may have just closed, so reload to show the real state
      api('/meal-marks/upcoming').then(setMeals).catch(() => {})
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <PageTitle kicker="Student" title="My Meals" />
      <p className="note">
        Tell the mess if you'll eat. This is only used to plan how much to cook and never affects
        your mess fee. Tap a choice again to clear it.
      </p>

      <ReminderBanner refreshKey={changes} />
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading meals...</p>}

      {groupByDate(meals).map((day) => (
        <section key={day.date} className="day">
          <h2>{dayLabel(day.date)}</h2>
          <div className="meal-grid">
            {day.items.map((meal) => (
              <MealCard
                key={meal.slot_id}
                meal={meal}
                onChange={handleChange}
                saving={savingId === meal.slot_id}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
