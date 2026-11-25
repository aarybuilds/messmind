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

export function describeShare(share) {
  if (share === 0) return 'held'
  if (share === 1) return 'all cooked'
  return `${Math.round(share * 100)}% cooked`
}

export default function ServicePanel({ service, onCheckIn, onDecision, busy }) {
  const [exact, setExact] = useState('')
  const [changing, setChanging] = useState(false)
  const { advice } = service

  // the advised choice gets the solid button
  const choices = [{ share: 1, label: 'Cook all of it', advised: advice?.action === 'cook' }]
  if (advice?.action === 'partial') {
    choices.push({ share: advice.fraction, label: `Cook ${Math.round(advice.fraction * 100)}% of it`, advised: true })
  }
  choices.push({ share: 0, label: 'Hold it', advised: advice?.action === 'hold' })

  function decide(share) {
    setChanging(false)
    onDecision(share)
  }

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

          {service.decision === null || changing ? (
            <>
              <div className="decide">
                {choices.map((c) => (
                  <button
                    key={c.label}
                    className={c.advised ? '' : 'secondary'}
                    disabled={busy}
                    onClick={() => decide(c.share)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="muted small">Decide by {formatTime(service.decideBy)}</p>
            </>
          ) : (
            <p className="decided">
              Recorded: held-back batch {describeShare(service.decision)}.{' '}
              <button className="link" disabled={busy} onClick={() => setChanging(true)}>
                Change
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
