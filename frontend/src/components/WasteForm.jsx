import { useState } from 'react'

export const LEVELS = [
  { value: 'empty', label: 'Empty' },
  { value: 'almost_empty', label: 'Almost empty' },
  { value: 'half_left', label: 'Half left' },
  { value: 'mostly_full', label: 'Mostly full' },
]

const levelLabel = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]))

// After service: one row per dish, four choices each (FR-19)
export default function WasteForm({ dishes, logged, onSubmit, busy, changes }) {
  const [levels, setLevels] = useState({})
  const complete = dishes.every((d) => levels[d.dish_id])

  if (logged) {
    return (
      <section className="card waste">
        <h3>Leftovers logged</h3>
        <ul className="waste-done">
          {dishes.map((d) => {
            const entry = logged.find((w) => w.dish_id === d.dish_id)
            return (
              <li key={d.dish_id}>
                <span>{d.name}</span>
                <strong>{entry ? levelLabel[entry.level] : '—'}</strong>
              </li>
            )
          })}
        </ul>
        {changes && changes.length > 0 && (
          <p className="muted small">
            Per-head amounts updated for next time:{' '}
            {changes
              .map((c) => `${c.dish} ${c.oldRate} → ${c.newRate} ${c.unit}`)
              .join(' · ')}
          </p>
        )}
      </section>
    )
  }

  function submit(e) {
    e.preventDefault()
    onSubmit(dishes.map((d) => ({ dish_id: d.dish_id, level: levels[d.dish_id] })))
  }

  return (
    <form className="card waste" onSubmit={submit}>
      <h3>How much is left in each container?</h3>
      <p className="muted small">A rough look is enough, no need to weigh anything.</p>
      {dishes.map((d) => (
        <div key={d.dish_id} className="waste-row">
          <span className="dish-name">{d.name}</span>
          <div className="levels">
            {LEVELS.map((l) => (
              <button
                type="button"
                key={l.value}
                className={levels[d.dish_id] === l.value ? 'level on' : 'level'}
                onClick={() => setLevels({ ...levels, [d.dish_id]: l.value })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="submit" disabled={!complete || busy}>
        Save leftovers
      </button>
    </form>
  )
}
