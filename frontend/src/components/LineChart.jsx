import { useRef, useState } from 'react'
import './charts.css'

const W = 760
const H = 280
const PAD = { top: 16, right: 110, bottom: 28, left: 44 }

// a round tick step (1, 2, 5, 10, 20, 50, 100...) giving about 4 gridlines
function niceStep(max) {
  const raw = max / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const m = raw / pow
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow
}

// series: [{ name, color, values: [number|null] }], labels: x labels (same length)
export default function LineChart({ title, series, labels, unit = '' }) {
  const [hover, setHover] = useState(null)
  const [asTable, setAsTable] = useState(false)
  const svgRef = useRef(null)

  const n = labels.length
  const all = series.flatMap((s) => s.values).filter((v) => v !== null)
  const step = niceStep(Math.max(1, ...all))
  const yMax = Math.ceil(Math.max(1, ...all) / step) * step
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const y = (v) => PAD.top + plotH - (v / yMax) * plotH
  const ticks = []
  for (let t = 0; t <= yMax; t += step) ticks.push(t)
  const every = Math.max(1, Math.ceil(n / 8))

  function path(values) {
    let d = ''
    values.forEach((v, i) => {
      if (v === null) return
      d += `${d && values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  }

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / plotW) * (n - 1))
    if (i < 0 || i >= n) return setHover(null)
    setHover({ i, left: (x(i) / W) * 100 })
  }

  // end-of-line labels, nudged apart so they don't overlap
  const ends = series
    .map((s) => {
      const last = [...s.values].reverse().find((v) => v !== null)
      return { name: s.name, color: s.color, y: last === undefined ? null : y(last) }
    })
    .filter((e) => e.y !== null)
    .sort((a, b) => a.y - b.y)
  for (let k = 1; k < ends.length; k++) {
    if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14
  }

  return (
    <figure className="chart">
      <div className="chart-head">
        <figcaption>{title}</figcaption>
        <button className="link small" onClick={() => setAsTable(!asTable)}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      <ul className="legend">
        {series.map((s) => (
          <li key={s.name}>
            <span className="swatch line" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>

      {asTable ? (
        <div className="chart-table">
          <table>
            <thead>
              <tr>
                <th></th>
                {series.map((s) => (
                  <th key={s.name}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={i}>
                  <td>{l}</td>
                  {series.map((s) => (
                    <td key={s.name}>{s.values[i] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
                <text x={PAD.left - 8} y={y(t) + 4} className="axis" textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % every === 0 ? (
                <text key={i} x={x(i)} y={H - 8} className="axis" textAnchor="middle">
                  {l}
                </text>
              ) : null
            )}

            {series.map((s) => (
              <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            ))}

            {ends.map((e) => (
              <text key={e.name} x={W - PAD.right + 8} y={e.y + 4} className="end-label">
                {e.name}
              </text>
            ))}

            {hover && (
              <g>
                <line x1={x(hover.i)} x2={x(hover.i)} y1={PAD.top} y2={PAD.top + plotH} className="crosshair" />
                {series.map((s) =>
                  s.values[hover.i] === null ? null : (
                    <circle
                      key={s.name}
                      cx={x(hover.i)}
                      cy={y(s.values[hover.i])}
                      r="4.5"
                      fill={s.color}
                      stroke="var(--paper)"
                      strokeWidth="2"
                    />
                  )
                )}
              </g>
            )}
            {/* bigger invisible hit area for the hover */}
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" />
          </svg>

          {hover && (
            <div className="tooltip" style={{ left: `${hover.left}%` }}>
              <strong>{labels[hover.i]}</strong>
              {series.map((s) => (
                <div key={s.name} className="tip-row">
                  <span className="swatch" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <span className="tip-val">
                    {s.values[hover.i] ?? '—'}
                    {unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
