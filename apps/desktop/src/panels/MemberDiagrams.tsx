import { useMemo, useState } from 'react'
import { comboDiagrams, type AnalysisResults, type LoadCombo } from '@hyperframe/engine'
import { useStore } from '../store'
import { fmt } from './format'

/**
 * Diagramas de esforços por barra (N, V, M) no inspetor, para a viga ou o
 * pilar selecionado, na combinação escolhida. Convenção de plotagem: momentos
 * no lado tracionado (sagging p/ baixo); V e N positivos p/ cima.
 */

interface Run {
  /** índices dos membros (model.members) na ordem do eixo do elemento */
  memberIds: number[]
  /** offset acumulado do início de cada membro, m */
  offsets: number[]
  total: number
  caption: string
}

function useMemberRun(kind: 'beam' | 'column', id: string): Run | null {
  const results = useStore((s) => s.results)
  const project = useStore((s) => s.project)
  const activeLevelId = useStore((s) => s.activeLevelId)

  return useMemo(() => {
    if (!results) return null
    const model = results.model
    let members = model.members.filter((m) => m.ref.kind === kind && m.ref.sourceId === id)
    if (members.length === 0) return null

    let caption = ''
    if (kind === 'beam') {
      const sorted = [...project.levels].sort((a, b) => a.elevation - b.elevation)
      const activeIdx = sorted.findIndex((l) => l.id === activeLevelId)
      const onActive = members.filter((m) => model.nodes[m.ni].levelIndex === activeIdx)
      const levelIdx = onActive.length > 0 ? activeIdx : model.nodes[members[0].ni].levelIndex
      members = members.filter((m) => model.nodes[m.ni].levelIndex === levelIdx)
      caption = sorted[levelIdx]?.name ?? ''
    } else {
      members = [...members].sort((a, b) => model.nodes[a.ni].z - model.nodes[b.ni].z)
      caption = 'da base ao topo'
    }

    const offsets: number[] = []
    let acc = 0
    for (const m of members) {
      offsets.push(acc)
      acc += m.length
    }
    return { memberIds: members.map((m) => m.id), offsets, total: acc, caption }
  }, [results, project, activeLevelId, kind, id])
}

interface Series {
  label: string
  unit: string
  /** plotar positivo p/ baixo (momentos no lado tracionado) */
  invert: boolean
  xs: number[]
  ys: number[]
  /** posições dos apoios/nós internos, m */
  joints: number[]
}

function buildSeries(
  run: Run,
  diagrams: ReturnType<typeof comboDiagrams>,
  field: 'N' | 'Vy' | 'Mz' | 'My',
  label: string,
  unit: string,
  invert: boolean,
): Series {
  const xs: number[] = []
  const ys: number[] = []
  const joints: number[] = []
  run.memberIds.forEach((mid, i) => {
    const d = diagrams[mid]
    const off = run.offsets[i]
    if (i > 0) joints.push(off)
    for (let s = 0; s < d.x.length; s++) {
      xs.push(off + d.x[s])
      ys.push(d[field][s])
    }
  })
  return { label, unit, invert, xs, ys, joints }
}

const W = 254
const H = 72
const PAD_X = 6
const PAD_Y = 12

function DiagramChart({ s }: { s: Series }) {
  const xMax = s.xs[s.xs.length - 1] || 1
  let vMin = Math.min(0, ...s.ys)
  let vMax = Math.max(0, ...s.ys)
  if (vMax - vMin < 1e-6) {
    vMin = -1
    vMax = 1
  }
  const sx = (x: number) => PAD_X + (x / xMax) * (W - 2 * PAD_X)
  const sy = (v: number) => {
    const t = (v - vMin) / (vMax - vMin)
    const yy = s.invert ? PAD_Y + t * (H - 2 * PAD_Y) : H - PAD_Y - t * (H - 2 * PAD_Y)
    return yy
  }
  const y0 = sy(0)

  let iMax = 0
  let iMin = 0
  for (let i = 0; i < s.ys.length; i++) {
    if (s.ys[i] > s.ys[iMax]) iMax = i
    if (s.ys[i] < s.ys[iMin]) iMin = i
  }
  const path = s.xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(s.ys[i]).toFixed(1)}`).join(' ')
  const area = `M${sx(s.xs[0]).toFixed(1)},${y0.toFixed(1)} ${s.xs
    .map((x, i) => `L${sx(x).toFixed(1)},${sy(s.ys[i]).toFixed(1)}`)
    .join(' ')} L${sx(xMax).toFixed(1)},${y0.toFixed(1)} Z`

  const labelFor = (i: number, anchorUp: boolean) => {
    const v = s.ys[i]
    if (Math.abs(v) < 1e-6) return null
    const x = Math.min(Math.max(sx(s.xs[i]), 26), W - 26)
    const y = sy(v) + (anchorUp !== s.invert ? -3 : 9)
    return (
      <text key={anchorUp ? 'max' : 'min'} x={x} y={y} textAnchor="middle" fontSize={9} fill="var(--text)">
        {fmt(v, Math.abs(v) >= 100 ? 0 : 1)}
      </text>
    )
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5 }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.label}</span>
        <span className="faint">
          máx {fmt(Math.max(...s.ys), 1)} · mín {fmt(Math.min(...s.ys), 1)} {s.unit}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          height: H,
          background: 'var(--bg-2)',
          borderRadius: 4,
          border: '1px solid var(--border)',
        }}
      >
        <path d={area} fill="var(--accent)" opacity={0.16} />
        {/* apoios / nós internos */}
        {s.joints.map((j, i) => (
          <line key={i} x1={sx(j)} y1={4} x2={sx(j)} y2={H - 4} stroke="var(--border)" strokeDasharray="2 3" />
        ))}
        <line x1={PAD_X} y1={y0} x2={W - PAD_X} y2={y0} stroke="var(--text-dim)" strokeWidth={0.8} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.4} />
        {labelFor(iMax, true)}
        {iMin !== iMax && labelFor(iMin, false)}
      </svg>
    </div>
  )
}

export function MemberForcesSection({ kind, id }: { kind: 'beam' | 'column'; id: string }) {
  const results = useStore((s) => s.results)
  const run = useMemberRun(kind, id)
  const combos = results?.combos ?? []
  const firstElu = combos.find((c) => c.type === 'ELU')
  const [comboId, setComboId] = useState<string>('')
  const effectiveId =
    comboId && combos.some((c) => c.id === comboId) ? comboId : (firstElu?.id ?? combos[0]?.id ?? '')

  const diagrams = useMemo(
    () => (results && effectiveId ? comboDiagrams(results, effectiveId) : null),
    [results, effectiveId],
  )

  const series = useMemo(() => {
    if (!results || !run || !diagrams) return null
    if (kind === 'beam') {
      return [
        buildSeries(run, diagrams, 'Mz', 'M (kN·m)', 'kN·m', true),
        buildSeries(run, diagrams, 'Vy', 'V (kN)', 'kN', false),
        buildSeries(run, diagrams, 'N', 'N (kN)', 'kN', false),
      ]
    }
    return [
      buildSeries(run, diagrams, 'N', 'N (kN)', 'kN', false),
      buildSeries(run, diagrams, 'Mz', 'Mz (kN·m)', 'kN·m', true),
      buildSeries(run, diagrams, 'My', 'My (kN·m)', 'kN·m', true),
    ]
  }, [results, run, diagrams, kind])

  if (!results || !run || !series) {
    return (
      <div className="faint" style={{ fontSize: 11, marginTop: 12 }}>
        Analise o modelo para ver os diagramas de esforços aqui.
      </div>
    )
  }

  return (
    <div className="panel-section" style={{ marginTop: 14 }}>
      <h3 className="panel-title">Esforços ({run.caption})</h3>
      <select
        className="select"
        style={{ width: '100%', marginBottom: 8 }}
        value={effectiveId}
        onChange={(e) => setComboId(e.target.value)}
        title="Combinação"
      >
        {combos.map((c: LoadCombo) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {series.map((s) => (
        <DiagramChart key={s.label} s={s} />
      ))}
      <div className="faint" style={{ fontSize: 10.5 }}>
        {kind === 'beam'
          ? 'M no lado tracionado (positivo = tração embaixo); linhas tracejadas = apoios/nós.'
          : 'Diagramas da base ao topo do pilar; linhas tracejadas = pavimentos.'}
      </div>
    </div>
  )
}
