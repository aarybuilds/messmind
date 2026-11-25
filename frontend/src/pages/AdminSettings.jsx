import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import './AdminSettings.css'

// shown as percentages where that is easier to think about
const FIELDS = [
  {
    key: 'safety_buffer',
    label: 'Safety buffer',
    percent: true,
    help: 'Extra added on top of the expected number, because running short is worse than a little left over.',
  },
  {
    key: 'first_batch_split',
    label: 'First batch',
    percent: true,
    help: 'Share of each dish cooked before service. The rest is held back until check-ins show whether it is needed.',
  },
  {
    key: 'reminder_hours',
    label: 'Reminder window',
    percent: false,
    help: 'Students who have not marked are reminded this many hours before marking closes.',
  },
]

export default function AdminSettings() {
  const [values, setValues] = useState({})
  const [limits, setLimits] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function show(data) {
    const v = {}
    for (const f of FIELDS) {
      const raw = data.settings[f.key]
      v[f.key] = f.percent ? Math.round(raw * 100) : raw
    }
    setValues(v)
    setLimits(data.limits)
  }

  useEffect(() => {
    api('/admin/settings').then(show).catch((err) => setError(err.message))
  }, [])

  async function save(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    const body = {}
    for (const f of FIELDS) {
      const n = Number(values[f.key])
      body[f.key] = f.percent ? n / 100 : n
    }
    try {
      show(await api('/admin/settings', { method: 'PUT', body }))
      setMessage('Saved. New forecasts will use these values.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <PageTitle kicker="Admin" title="Settings" />
      <form className="card settings" onSubmit={save}>
        {FIELDS.map((f) => {
          const lim = limits[f.key]
          return (
            <div key={f.key} className="setting">
              <label htmlFor={f.key}>{f.label}</label>
              <div className="setting-input">
                <input
                  id={f.key}
                  type="number"
                  step="1"
                  min={lim ? (f.percent ? lim.min * 100 : lim.min) : undefined}
                  max={lim ? (f.percent ? lim.max * 100 : lim.max) : undefined}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  required
                />
                <span>{f.percent ? '%' : 'hours'}</span>
              </div>
              <p className="muted small">{f.help}</p>
            </div>
          )
        })}
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <button type="submit">Save settings</button>
      </form>
    </>
  )
}
