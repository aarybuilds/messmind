import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import ForecastBreakdown from '../components/ForecastBreakdown'
import DishPlan from '../components/DishPlan'
import ServicePanel from '../components/ServicePanel'
import WasteForm from '../components/WasteForm'
import { dayLabel, formatTime, mealNames } from '../utils/format'
import './StaffDashboard.css'

export default function StaffDashboard() {
  const [slots, setSlots] = useState([])
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rateChanges, setRateChanges] = useState(null)

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
    const load = () =>
      api(`/staff/slots/${selected}`)
        .then(setView)
        .catch((err) => setError(err.message))
    load()
    // another counter may be logging check-ins too
    const timer = setInterval(load, 30 * 1000)
    return () => clearInterval(timer)
  }, [selected])

  // both return the refreshed view, so the screen updates straight away (NFR-5)
  async function post(path, body) {
    setError('')
    setBusy(true)
    try {
      setView(await api(`/staff/slots/${selected}/${path}`, { method: 'POST', body }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveWaste(entries) {
    setError('')
    setBusy(true)
    try {
      const result = await api(`/staff/slots/${selected}/waste`, { method: 'POST', body: { entries } })
      setRateChanges(result.changes)
      setView(result.view)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle kicker="Mess Staff" title="Preparation Plan" />

      <div className="meal-tabs">
        {slots.map((s) => (
          <button
            key={s.slot_id}
            className={s.slot_id === selected ? 'tab active' : 'tab'}
            onClick={() => {
              setSelected(s.slot_id)
              setRateChanges(null)
            }}
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

          {view.service.inWindow && (
            <ServicePanel
              service={view.service}
              busy={busy}
              onCheckIn={(body) => post('check-ins', body)}
              onDecision={(share) => post('held-back', { share })}
            />
          )}

          {view.serviceOver && (
            <>
              <p className="banner">
                Service is over. {view.service.checkedIn} checked in
                {view.actual !== null && view.actual !== undefined ? `, ${view.actual} ate` : ''}.
              </p>
              <WasteForm
                key={view.slot_id}
                dishes={view.dishes}
                logged={view.waste}
                changes={rateChanges}
                busy={busy}
                onSubmit={saveWaste}
              />
            </>
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
