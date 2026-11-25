import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import { dayLabel, groupByDate } from '../utils/format'
import './StudentHistory.css'

const MEALS = ['breakfast', 'lunch', 'dinner']

function MealCell({ meal }) {
  if (!meal) return <td></td>
  const said =
    meal.intent_to_eat === true ? 'said yes' : meal.intent_to_eat === false ? 'said no' : 'not marked'
  return (
    <td>
      <span className={meal.attended ? 'ate' : 'skipped'}>{meal.attended ? 'Ate' : 'Skipped'}</span>
      <span className="said">{said}</span>
    </td>
  )
}

export default function StudentHistory() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api('/meal-marks/history')
      .then(setRows)
      .catch((err) => setError(err.message))
  }, [])

  const marked = rows.filter((r) => r.intent_to_eat !== null).length
  const ate = rows.filter((r) => r.attended).length

  return (
    <>
      <PageTitle kicker="Student" title="My History" />
      <p className="muted">Your declarations and meals over the last 30 days. Only you can see this.</p>

      {error && <p className="error">{error}</p>}

      <div className="history-stats">
        <div>
          <span className="big">{rows.length}</span>
          <span>meals served</span>
        </div>
        <div>
          <span className="big">{ate}</span>
          <span>you ate</span>
        </div>
        <div>
          <span className="big">{marked}</span>
          <span>you marked in advance</span>
        </div>
      </div>

      <table className="history-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Breakfast</th>
            <th>Lunch</th>
            <th>Dinner</th>
          </tr>
        </thead>
        <tbody>
          {groupByDate(rows).map((day) => (
            <tr key={day.date}>
              <td className="day-cell">{dayLabel(day.date)}</td>
              {MEALS.map((type) => (
                <MealCell key={type} meal={day.items.find((m) => m.type === type)} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
