import { useState } from 'react'
import { formatTime } from '../utils/format'

const actionTitle = {
  cook: 'Cook the held-back batch now',
  partial: 'Cook part of the held-back batch',
  hold: 'Hold the held-back batch',
  wait: 'Keep counting',
}

function amount(d) {
  return d.unit === 'pcs' ? `${d.amount} pcs` : `${d.amount} ${d.unit}`
}

export default function ServicePanel({ service, onCheckIn, onDecision, busy }) {
  const [exact, setExact] = useState('')
  const { advice } = service

  function saveExact(e) {
    e.preventDefault()
    const n = parseInt(exact, 10)
    if (Number.isNaN(n)) return
    onCheckIn({ count: n })
    setExact('')
  }

  return (
    <section className="service-panel card">
      <div className="checkin">
        <p className="page-kicker">Live service · {service.minutesIn} min in</p>
        <div className="count">
          <span className="big">{service.checkedIn}</span>
          <span>
            checked in
            {advice && <span className="muted"> · about {advice.expectedByNow} expected by now</span>}
          </span>
        </div>
        <div className="add-buttons">
          {[1, 5, 10].map((n) => (
            <button key={n} disabled={busy} onClick={() => onCheckIn({ add: n })}>
              +{n}
            </button>
          ))}
        </div>
        <form className="exact" onSubmit={saveExact}>
          <input
            type="number"
            min="0"
            placeholder="Set exact count"
            value={exact}
            onChange={(e) => setExact(e.target.value)}
          />
          <button className="secondary" disabled={busy || exact === ''}>
            Save
          </button>
        </form>
      </div>

      {advice && (
        <div className={`advice ${advice.action}`}>
          <h3>{actionTitle[advice.action]}</h3>
          <p>{advice.reason}</p>
          {advice.dishes.some((d) => d.amount > 0) && (
            <p className="to-cook">
              {advice.dishes
                .filter((d) => d.amount > 0)
                .map((d) => `${d.name} ${amount(d)}`)
                .join(' · ')}
            </p>
          )}

          {service.decision === null ? (
            <>
              <div className="decide">
                <button disabled={busy} onClick={() => onDecision(true)}>
                  Cooking it
                </button>
                <button className="secondary" disabled={busy} onClick={() => onDecision(false)}>
                  Holding it
                </button>
              </div>
              <p className="muted small">Decide by {formatTime(service.decideBy)}</p>
            </>
          ) : (
            <p className="decided">
              Recorded: held-back batch {service.decision ? 'cooked' : 'held'}.{' '}
              <button className="link" disabled={busy} onClick={() => onDecision(!service.decision)}>
                Change
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
