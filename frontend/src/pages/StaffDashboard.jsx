import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import ForecastBreakdown from '../components/ForecastBreakdown'
import DishPlan from '../components/DishPlan'
import { dayLabel, formatTime, mealNames } from '../utils/format'
import './StaffDashboard.css'

export default function StaffDashboard() {
  const [slots, setSlots] = useState([])
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/staff/slots')
      .then((data) => {
        setSlots(data.slots)
        setSelected(data.currentId)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    api(`/staff/slots/${selected}`)
      .then(setView)
      .catch((err) => setError(err.message))
  }, [selected])

  return (
    <>
      <PageTitle kicker="Mess Staff" title="Preparation Plan" />

      <div className="meal-tabs">
        {slots.map((s) => (
          <button
            key={s.slot_id}
            className={s.slot_id === selected ? 'tab active' : 'tab'}
            onClick={() => setSelected(s.slot_id)}
          >
            <span className="tab-day">{dayLabel(s.date).split(' · ')[0]}</span>
            {mealNames[s.type]}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {view && view.slot_id === selected && (
        <>
          {view.markingOpen && (
            <p className="banner">
              Students can still change their answer, so these numbers will move until marking closes.
            </p>
          )}

          <div className="plan-grid">
            <section>
              <div className="headline">
                <span className="big">{view.headcount}</span>
                <span>
                  students to cook for
                  <br />
                  <span className="muted">
                    {mealNames[view.type]} · {formatTime(view.serviceStartsAt)} – {formatTime(view.serviceEndsAt)}
                  </span>
                </span>
              </div>
              <DishPlan dishes={view.dishes} decision={view.service.decision} />
              <p className="muted small">
                Cook the first batch before service. Whether to cook the held-back batch is decided from
                check-ins in the first 20 minutes.
              </p>
            </section>

            <ForecastBreakdown f={view} />
          </div>
        </>
      )}
    </>
  )
}
