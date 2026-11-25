import { useEffect, useState } from 'react'
import { api } from '../api'
import PageTitle from '../components/PageTitle'
import { dayLabel, formatTime, groupByDate, mealNames } from '../utils/format'
import './AdminMeals.css'

// ISO string -> value for <input type="datetime-local"> in the browser's time zone
function toInput(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function MealEditor({ slot, dishes, onSaved, onCancel }) {
  const [form, setForm] = useState({
    closes: toInput(slot.marking_closes_at),
    starts: toInput(slot.service_starts_at),
    ends: toInput(slot.service_ends_at),
    dishIds: slot.dish_ids,
  })
  const [error, setError] = useState('')

  function toggleDish(id) {
    const has = form.dishIds.includes(id)
    setForm({ ...form, dishIds: has ? form.dishIds.filter((d) => d !== id) : [...form.dishIds, id] })
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    try {
      await api(`/admin/slots/${slot.slot_id}`, {
        method: 'PUT',
        body: {
          marking_closes_at: new Date(form.closes).toISOString(),
          service_starts_at: new Date(form.starts).toISOString(),
          service_ends_at: new Date(form.ends).toISOString(),
          dish_ids: form.dishIds,
        },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="meal-editor" onSubmit={save}>
      <div className="times">
        <div>
          <label>Marking closes</label>
          <input type="datetime-local" value={form.closes} onChange={(e) => setForm({ ...form, closes: e.target.value })} />
        </div>
        <div>
          <label>Service starts</label>
          <input type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} />
        </div>
        <div>
          <label>Service ends</label>
          <input type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} />
        </div>
      </div>
      <label>Menu</label>
      <div className="dish-picks">
        {dishes.map((d) => (
          <label key={d.dish_id} className={form.dishIds.includes(d.dish_id) ? 'pick on' : 'pick'}>
            <input type="checkbox" checked={form.dishIds.includes(d.dish_id)} onChange={() => toggleDish(d.dish_id)} />
            {d.name}
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="editor-actions">
        <button type="submit">Save</button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const emptyDish = { name: '', unit: 'kg', rate: '' }

export default function AdminMeals() {
  const [slots, setSlots] = useState([])
  const [dishes, setDishes] = useState([])
  const [editing, setEditing] = useState(null)
  const [newDish, setNewDish] = useState(emptyDish)
  const [error, setError] = useState('')

  function load() {
    Promise.all([api('/admin/slots'), api('/admin/dishes')])
      .then(([s, d]) => {
        setSlots(s)
        setDishes(d)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(load, [])

  const dishName = Object.fromEntries(dishes.map((d) => [d.dish_id, d.name]))

  async function addDish(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/admin/dishes', {
        method: 'POST',
        body: { name: newDish.name, unit: newDish.unit, consumption_rate: Number(newDish.rate) },
      })
      setNewDish(emptyDish)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <PageTitle kicker="Admin" title="Meals and Menu" />
      {error && <p className="error">{error}</p>}

      {groupByDate(slots).map((day) => (
        <section key={day.date} className="admin-day">
          <h2>{dayLabel(day.date)}</h2>
          {day.items.map((s) => (
            <div key={s.slot_id} className="admin-meal">
              <div className="admin-meal-row">
                <strong className="meal-type">{mealNames[s.type]}</strong>
                <span className="muted">
                  {formatTime(s.service_starts_at)} – {formatTime(s.service_ends_at)} · marking closes{' '}
                  {formatTime(s.marking_closes_at)}
                </span>
                <span className="menu-list">{s.dish_ids.map((id) => dishName[id]).join(', ')}</span>
                {s.editable ? (
                  editing !== s.slot_id && (
                    <button className="secondary small" onClick={() => setEditing(s.slot_id)}>
                      Edit
                    </button>
                  )
                ) : (
                  <span className="locked-tag">Locked</span>
                )}
              </div>
              {editing === s.slot_id && (
                <MealEditor
                  slot={s}
                  dishes={dishes}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null)
                    load()
                  }}
                />
              )}
            </div>
          ))}
        </section>
      ))}

      <section className="card add-dish">
        <h3>Dishes</h3>
        <table>
          <thead>
            <tr>
              <th>Dish</th>
              <th>Per student</th>
            </tr>
          </thead>
          <tbody>
            {dishes.map((d) => (
              <tr key={d.dish_id}>
                <td>{d.name}</td>
                <td>
                  {d.consumption_rate} {d.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Per-student amounts are adjusted automatically from the leftovers staff log.</p>
        <form onSubmit={addDish} className="dish-form">
          <input placeholder="New dish" value={newDish.name} onChange={(e) => setNewDish({ ...newDish, name: e.target.value })} required />
          <input
            type="number"
            step="0.001"
            min="0"
            placeholder="Per student"
            value={newDish.rate}
            onChange={(e) => setNewDish({ ...newDish, rate: e.target.value })}
            required
          />
          <select value={newDish.unit} onChange={(e) => setNewDish({ ...newDish, unit: e.target.value })}>
            <option value="kg">kg</option>
            <option value="L">L</option>
            <option value="pcs">pcs</option>
          </select>
          <button type="submit">Add</button>
        </form>
      </section>
    </>
  )
}
