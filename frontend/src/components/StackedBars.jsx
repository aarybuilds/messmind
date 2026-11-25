import { useState } from 'react'
import './charts.css'

// rows: [{ label, parts: { key: count } }], levels: [{ key, label, color }] in order
export default function StackedBars({ title, rows, levels, unitLabel = 'meals' }) {
  const [tip, setTip] = useState(null)

  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <ul className="legend">
        {levels.map((l) => (
          <li key={l.key}>
            <span className="swatch" style={{ background: l.color }} />
            {l.label}
          </li>
        ))}
      </ul>

      {rows.map((r) => {
        const total = levels.reduce((t, l) => t + (r.parts[l.key] || 0), 0)
        return (
          <div className="bar-row" key={r.label}>
            <span>{r.label}</span>
            <div className="bar-track" onMouseLeave={() => setTip(null)}>
              {levels.map((l) => {
                const count = r.parts[l.key] || 0
                if (!count) return null
                const pct = Math.round((count / total) * 100)
                return (
                  <div
                    key={l.key}
                    className="bar-seg"
                    style={{ width: `${(count / total) * 100}%`, background: l.color }}
                    onMouseEnter={() => setTip({ row: r.label, text: `${l.label}: ${count} ${unitLabel} (${pct}%)` })}
                  />
                )
              })}
              {tip && tip.row === r.label && (
                <div className="tooltip" style={{ left: '50%', top: '-2.2rem' }}>
                  {r.label} · {tip.text}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </figure>
  )
}
