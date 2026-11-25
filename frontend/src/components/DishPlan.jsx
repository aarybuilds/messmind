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
            <td className={decision === true ? 'held cooked' : 'held'}>
              {qty(d.heldBack, d.unit)}
              {decision === true && <span className="tag">cooked</span>}
              {decision === false && <span className="tag">held</span>}
            </td>
            <td className="muted">{qty(d.total, d.unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
