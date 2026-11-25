import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import LineChart from '../components/LineChart'
import StackedBars from '../components/StackedBars'
import { mealNames } from '../utils/format'
import './AdminHome.css'

// checked with the dataviz palette validator against the paper background
const SERIES = { actual: '#257de0', forecast: '#f47230', yes: '#00b894' }
const LEVELS = [
  { key: 'empty', label: 'Empty', color: '#6aabf1' },
  { key: 'almost_empty', label: 'Almost empty', color: '#257de0' },
  { key: 'half_left', label: 'Half left', color: '#1757ac' },
  { key: 'mostly_full', label: 'Mostly full', color: '#0e3d7e' },
]

function shortDate(d) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function Sparkline({ values }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 80},${18 - ((v - min) / span) * 16}`)
  return (
    <svg width="80" height="20" viewBox="0 0 80 20" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={SERIES.actual} strokeWidth="2" />
    </svg>
  )
}

export default function AdminHome() {
  const [data, setData] = useState(null)
  const [mealType, setMealType] = useState('dinner')
  const [error, setError] = useState('')

  useEffect(() => {
    api('/admin/analytics?days=30')
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading...</p>

  const { summary, heldBack, rates } = data
  const meals = data.meals.filter((m) => m.type === mealType)
  const notCooked = Object.fromEntries(heldBack.notCooked.map((r) => [r.unit, r.amount]))
  const partMeals = heldBack.decisions.find((d) => d.decision === 'part')?.meals || 0
  const heldMeals = heldBack.decisions.find((d) => d.decision === 'held')?.meals || 0

  const leftoverRows = {}
  for (const w of data.waste) {
    leftoverRows[w.dish] = leftoverRows[w.dish] || {}
    leftoverRows[w.dish][w.level] = w.meals
  }

  return (
    <>
      <PageTitle kicker="Admin" title="Overview" />
      <p className="muted">Last {data.days} days · {summary.meals} meals · about {summary.averageAttendance} students a meal</p>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Average miss per meal</span>
          <span className="tile-big">{summary.error.formula}</span>
          <span className="tile-sub">
            students off with MessMind. Counting "yes" alone would have been {Math.round(summary.error.countOfYes)} off.
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Held-back food not needed</span>
          <span className="tile-big">{Math.round(notCooked.kg || 0)} kg</span>
          <span className="tile-sub">
            plus {Math.round(notCooked.L || 0)} L and {Math.round(notCooked.pcs || 0).toLocaleString('en-IN')} pieces that
            would have been cooked up front without staged cooking.
          </span>
        </div>
        <div className="tile">
          <span className="tile-label">Held-back decisions</span>
          <span className="tile-big">{partMeals + heldMeals}</span>
          <span className="tile-sub">
            meals where some of the held-back batch was not cooked ({heldMeals} held completely).
          </span>
        </div>
      </div>

      <div className="filter-row">
        {['breakfast', 'lunch', 'dinner'].map((t) => (
          <button key={t} className={t === mealType ? 'tab active' : 'tab'} onClick={() => setMealType(t)}>
            {mealNames[t]}
          </button>
        ))}
      </div>

      <LineChart
        title={`${mealNames[mealType]}: forecast against who actually ate`}
        labels={meals.map((m) => shortDate(m.date))}
        series={[
          { name: 'Actually ate', color: SERIES.actual, values: meals.map((m) => m.actual) },
          { name: 'MessMind forecast', color: SERIES.forecast, values: meals.map((m) => Math.round(m.expected)) },
          { name: 'Said "yes"', color: SERIES.yes, values: meals.map((m) => m.yes_count) },
        ]}
      />
      {summary.error.regression !== null && (
        <p className="muted small">
          The regression check averaged {summary.error.regression} students off over the meals where it ran. The kitchen plan
          uses the formula.
        </p>
      )}

      <div className="two-col">
        <StackedBars
          title="What was left in the containers"
          levels={LEVELS}
          rows={Object.entries(leftoverRows).map(([dish, parts]) => ({ label: dish, parts }))}
        />

        <div className="chart">
          <h3>Per-student amounts learned from leftovers</h3>
          <table className="rates">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Started</th>
                <th>Now</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => {
                const change = Math.round(((r.now - r.started) / r.started) * 100)
                return (
                  <tr key={r.dish}>
                    <td>{r.dish}</td>
                    <td>
                      {r.started} {r.unit}
                    </td>
                    <td>
                      {r.now} {r.unit}{' '}
                      <span className="muted small">
                        ({change > 0 ? '+' : ''}
                        {change}%)
                      </span>
                    </td>
                    <td>
                      <Sparkline values={[r.started, ...r.history.map((h) => h.rate)]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
