import { formatTime, mealNames, timeLeft } from '../utils/format'

function declaredText(intent) {
  if (intent === true) return 'Eating'
  if (intent === false) return 'Not eating'
  return 'Not marked'
}

export default function MealCard({ meal, onChange, saving }) {
  const { type, menu, intent_to_eat: intent, is_open: open } = meal

  return (
    <div className={`meal-card ${open ? '' : 'closed'}`}>
      <div className="meal-head">
        <h3>{mealNames[type]}</h3>
        <span className="meal-time">
          {formatTime(meal.service_starts_at)} – {formatTime(meal.service_ends_at)}
        </span>
      </div>

      <p className="menu">{menu?.join(' · ')}</p>

      {open ? (
        <>
          <div className="toggle" role="group" aria-label={`${mealNames[type]} intent`}>
            <button
              className={intent === true ? 'on yes' : ''}
              disabled={saving}
              onClick={() => onChange(meal, intent === true ? null : true)}
            >
              Eating
            </button>
            <button
              className={intent === false ? 'on no' : ''}
              disabled={saving}
              onClick={() => onChange(meal, intent === false ? null : false)}
            >
              Not eating
            </button>
          </div>
          <p className="cutoff">
            Marking closes {timeLeft(meal.marking_closes_at)} ({formatTime(meal.marking_closes_at)})
          </p>
        </>
      ) : (
        <p className="locked">
          Marking closed · You said: <strong>{declaredText(intent)}</strong>
        </p>
      )}
    </div>
  )
}
