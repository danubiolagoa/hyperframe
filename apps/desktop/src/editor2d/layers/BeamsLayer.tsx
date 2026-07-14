import { memo, type ReactElement } from 'react'
import type { Beam } from '@hyperframe/engine'
import { sectionLabel } from '../format'

interface Props {
  beams: Beam[]
  k: number
  showNames: boolean
  selectedId: string | null
  hoveredId: string | null
}

/** vigas: contorno duplo ±bw/2 + linha de centro tracejada + rótulo rotacionado */
export default memo(function BeamsLayer({ beams, k, showNames, selectedId, hoveredId }: Props) {
  const withNames = showNames && k >= 8
  return (
    <g>
      {beams.map((b) => (
        <BeamGlyph
          key={b.id}
          beam={b}
          k={k}
          showName={withNames}
          sel={b.id === selectedId}
          hov={b.id === hoveredId && b.id !== selectedId}
        />
      ))}
    </g>
  )
})

function BeamGlyph({
  beam,
  k,
  showName,
  sel,
  hov,
}: {
  beam: Beam
  k: number
  showName: boolean
  sel: boolean
  hov: boolean
}) {
  const edge = sel ? 'var(--sel)' : hov ? 'var(--blue)' : '#7d879c'
  const edgeW = sel ? 2.5 : 1
  const center = sel ? 'var(--sel)' : hov ? 'var(--blue)' : '#566078'
  const secOf = (i: number) => beam.segmentSections?.[i] ?? beam.section

  const parts: ReactElement[] = []
  let longest = -1
  let li = 0
  for (let i = 0; i + 1 < beam.path.length; i++) {
    const a = beam.path[i]
    const c = beam.path[i + 1]
    const half = (secOf(i).bw / 2) * k
    const ax = a.x * k
    const ay = -a.y * k
    const cx = c.x * k
    const cy = -c.y * k
    const dx = cx - ax
    const dy = cy - ay
    const L = Math.hypot(dx, dy)
    if (L < 1e-9) continue
    if (L > longest) {
      longest = L
      li = i
    }
    const nx = (-dy / L) * half
    const ny = (dx / L) * half
    parts.push(
      <g key={i}>
        {(sel || hov) && (
          <line
            x1={ax}
            y1={ay}
            x2={cx}
            y2={cy}
            stroke={sel ? 'var(--sel)' : 'var(--blue)'}
            strokeWidth={half * 2 + 8}
            opacity={sel ? 0.14 : 0.16}
            strokeLinecap="round"
          />
        )}
        <line x1={ax + nx} y1={ay + ny} x2={cx + nx} y2={cy + ny} stroke={edge} strokeWidth={edgeW} />
        <line x1={ax - nx} y1={ay - ny} x2={cx - nx} y2={cy - ny} stroke={edge} strokeWidth={edgeW} />
        <line x1={ax} y1={ay} x2={cx} y2={cy} stroke={center} strokeWidth={1} strokeDasharray="4 2" />
      </g>,
    )
  }

  // furos na alma: retângulo tracejado sobre o eixo
  const openings: ReactElement[] = []
  for (const op of beam.openings ?? []) {
    let acc = 0
    for (let i = 0; i + 1 < beam.path.length; i++) {
      const a = beam.path[i]
      const c = beam.path[i + 1]
      const L = Math.hypot(c.x - a.x, c.y - a.y)
      if (L < 1e-9) continue
      const isLast = i + 2 === beam.path.length
      if (op.x <= acc + L || isLast) {
        const t = Math.min(Math.max((op.x - acc) / L, 0), 1)
        const px = (a.x + (c.x - a.x) * t) * k
        const py = -(a.y + (c.y - a.y) * t) * k
        const tx = (c.x - a.x) / L
        const ty = -(c.y - a.y) / L
        const hw = (op.width / 2) * k
        const hb = (secOf(i).bw / 2) * k
        const cxs = [
          [px - tx * hw + ty * hb, py - ty * hw - tx * hb],
          [px + tx * hw + ty * hb, py + ty * hw - tx * hb],
          [px + tx * hw - ty * hb, py + ty * hw + tx * hb],
          [px - tx * hw - ty * hb, py - ty * hw + tx * hb],
        ]
        openings.push(
          <polygon
            key={op.id}
            points={cxs.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="var(--bg, #fff)"
            fillOpacity={0.65}
            stroke="#c47b1e"
            strokeWidth={1.2}
            strokeDasharray="3 2"
          />,
        )
        break
      }
      acc += L
    }
  }

  let label: ReactElement | null = null
  if (showName && longest > 30) {
    const a = beam.path[li]
    const c = beam.path[li + 1]
    const half = (secOf(li).bw / 2) * k
    const ax = a.x * k
    const ay = -a.y * k
    const cx = c.x * k
    const cy = -c.y * k
    const mx = (ax + cx) / 2
    const my = (ay + cy) / 2
    let deg = (Math.atan2(cy - ay, cx - ax) * 180) / Math.PI
    if (deg > 90) deg -= 180
    if (deg <= -90) deg += 180
    const hasOverrides = (beam.segmentSections ?? []).some((s) => s != null)
    const sectionsTxt = hasOverrides
      ? [...new Set(beam.path.slice(0, -1).map((_, i) => sectionLabel(secOf(i))))].join('/')
      : sectionLabel(beam.section)
    label = (
      <g transform={`translate(${mx} ${my}) rotate(${deg})`}>
        <text y={-(half + 4)} textAnchor="middle" fontSize={10} fill="var(--text-dim)">
          {beam.name} {sectionsTxt}
        </text>
      </g>
    )
  }

  return (
    <g>
      {parts}
      {openings}
      {label}
    </g>
  )
}
