function shareTag(share) {
  if (share === null || share === undefined) return null
  if (share === 0) return 'held'
  if (share === 1) return 'cooked'
  return `${Math.round(share * 100)}% cooked`
}

function qty(value, unit) {
  if (unit === 'pcs') return `${Math.round(value)} pcs`
  return `${value.toFixed(1)} ${unit}`
}

// The kitchen sees kilograms, litres and pieces, not a headcount (FR-18)
export default function DishPlan({ dishes, decision }) {
  return (
    <table className="dish-plan">
      <thead>
        <tr>
          <th>Dish</th>
          <th>Cook first</th>
          <th>Hold back</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {dishes.map((d) => (
          <tr key={d.dish_id}>
            <td className="dish-name">{d.name}</td>
            <td className="first">{qty(d.firstBatch, d.unit)}</td>
            <td className="held">
              {qty(d.heldBack, d.unit)}
              {shareTag(decision) && <span className="tag">{shareTag(decision)}</span>}
            </td>
            <td className="muted">{qty(d.total, d.unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
