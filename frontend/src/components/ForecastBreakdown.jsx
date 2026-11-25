const stageText = {
  0: 'Starting out: no history yet, using institute defaults',
  1: 'Using averages for this meal and day of the week',
  2: "Using each student's own history",
  3: "Using each student's own history, with a regression check",
}

function avg(part, count) {
  return count ? (part / count).toFixed(2) : '—'
}

// Shows exactly how the number was reached, so it can be checked by hand (NFR-4)
export default function ForecastBreakdown({ f }) {
  const rows = [
    { label: 'Said they will eat', count: f.yesCount, part: f.yesPart, weight: 'reliability' },
    { label: 'Said they will not', count: f.noCount, part: f.noPart, weight: 'flip rate' },
    { label: "Didn't say", count: f.noneCount, part: f.nonePart, weight: 'baseline' },
  ]

  return (
    <div className="card breakdown">
      <h3>How this number was worked out</h3>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{r.count}</td>
              <td className="muted small">
                × {avg(r.part, r.count)} avg {r.weight}
              </td>
              <td className="num strong">{r.part.toFixed(1)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan="3">Expected to eat</td>
            <td className="num strong">{f.expected.toFixed(1)}</td>
          </tr>
          <tr>
            <td colSpan="3">Plus {Math.round(f.buffer * 100)}% safety buffer, rounded up</td>
            <td className="num strong">{f.headcount}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        A plain count of "yes" would have said {f.yesCount}. {stageText[f.stage]}.
      </p>
      {f.mlEstimate !== null && (
        <p className="muted small">
          Regression check: {f.mlEstimate.toFixed(0)} students. Shown for comparison; the plan above uses
          the formula.
        </p>
      )}
    </div>
  )
}
