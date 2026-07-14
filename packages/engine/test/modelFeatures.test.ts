import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../src/model/factory'
import { uid } from '../src/model/uid'
import { buildAnalysisModel } from '../src/analysis/buildModel'
import { checkConsistency } from '../src/model/consistency'
import type { Project } from '../src/model/types'

/** pórtico plano mínimo: 2 pilares e 1 viga de 6 m entre eles */
function twoColumnFrame(): Project {
  const p = createEmptyProject({
    name: 'T',
    fck: 30000,
    aggregate: 'granito',
    caa: 'II',
    numFloors: 1,
    floorHeight: 3,
    wind: { enabled: false, v0: 40, s1: 1, category: 4, s3Group: 2 },
    createdAt: '2026-01-01',
  })
  p.settings.considerSelfWeight = false
  const [base, top] = p.levels
  p.columns = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
  ].map((pos, i) => ({
    id: uid('col'),
    name: `P${i + 1}`,
    pos,
    section: { bw: 0.25, h: 0.5 },
    rotationDeg: 0 as const,
    baseLevelId: base.id,
    topLevelId: top.id,
  }))
  p.plans[0].beams = [
    {
      id: uid('bm'),
      name: 'V1',
      path: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
      section: { bw: 0.2, h: 0.5 },
    },
  ]
  return p
}

describe('seção variável por trecho', () => {
  it('divide o vão de dimensionamento na mudança de seção', () => {
    const p = twoColumnFrame()
    const beam = p.plans[0].beams[0]
    beam.path = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
    ]
    beam.segmentSections = [null, { bw: 0.2, h: 0.35 }]
    const { model } = buildAnalysisModel(p)
    const beamMembers = model.members.filter((m) => m.ref.kind === 'beam')
    expect(beamMembers).toHaveLength(2)
    // seções distintas por trecho
    expect(beamMembers[0].section.h).toBeCloseTo(0.5, 9)
    expect(beamMembers[1].section.h).toBeCloseTo(0.35, 9)
    // vãos de dimensionamento separados (mesmo sem pilar no meio)
    expect(beamMembers[0].ref.spanIndex).toBe(0)
    expect(beamMembers[1].ref.spanIndex).toBe(1)
  })

  it('sem override a viga continua com um vão único', () => {
    const p = twoColumnFrame()
    p.plans[0].beams[0].path = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
    ]
    const { model } = buildAnalysisModel(p)
    const beamMembers = model.members.filter((m) => m.ref.kind === 'beam')
    expect(beamMembers).toHaveLength(2)
    expect(new Set(beamMembers.map((m) => m.ref.spanIndex)).size).toBe(1)
  })
})

describe('carga de parede parcial', () => {
  it('aplica apenas o trecho [x0, x1] conservando a força total', () => {
    const p = twoColumnFrame()
    const beam = p.plans[0].beams[0]
    p.plans[0].wallLoads = [{ id: uid('wl'), beamId: beam.id, w: 10, x0: 0, x1: 3 }]
    const { model, internal } = buildAnalysisModel(p)
    let total = 0
    model.members.forEach((m, mi) => {
      if (m.ref.kind !== 'beam') return
      total += -internal.memberLoads.G[mi].wy * m.length
    })
    expect(total).toBeCloseTo(30, 6) // 10 kN/m × 3 m (metade da viga)
  })

  it('sem extensão cobre a viga inteira (compatibilidade)', () => {
    const p = twoColumnFrame()
    const beam = p.plans[0].beams[0]
    p.plans[0].wallLoads = [{ id: uid('wl'), beamId: beam.id, w: 10 }]
    const { model, internal } = buildAnalysisModel(p)
    let total = 0
    model.members.forEach((m, mi) => {
      if (m.ref.kind !== 'beam') return
      total += -internal.memberLoads.G[mi].wy * m.length
    })
    expect(total).toBeCloseTo(60, 6)
  })
})

describe('borda livre — redistribuição de quinhões', () => {
  function slabOn3Beams(): Project {
    const p = createEmptyProject({
      name: 'T',
      fck: 30000,
      aggregate: 'granito',
      caa: 'II',
      numFloors: 1,
      floorHeight: 3,
      wind: { enabled: false, v0: 40, s1: 1, category: 4, s3Group: 2 },
      createdAt: '2026-01-01',
    })
    p.settings.considerSelfWeight = false
    const [base, top] = p.levels
    const pts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]
    p.columns = pts.map((pos, i) => ({
      id: uid('col'),
      name: `P${i + 1}`,
      pos,
      section: { bw: 0.25, h: 0.25 },
      rotationDeg: 0 as const,
      baseLevelId: base.id,
      topLevelId: top.id,
    }))
    // apenas 3 vigas — borda superior (y=4) LIVRE
    p.plans[0].beams = [
      [pts[0], pts[1]],
      [pts[1], pts[2]],
      [pts[3], pts[0]],
    ].map((path, i) => ({
      id: uid('bm'),
      name: `V${i + 1}`,
      path: [...path],
      section: { bw: 0.2, h: 0.5 },
    }))
    p.plans[0].slabs = [
      {
        id: uid('sl'),
        name: 'L1',
        polygon: pts.map((q) => ({ ...q })),
        thickness: 0.1,
        finishLoad: 1.0,
        liveLoad: 2.0,
      },
    ]
    return p
  }

  it('quinhão da borda livre vai p/ as bordas apoiadas (força conservada)', () => {
    const { model, internal } = buildAnalysisModel(slabOn3Beams())
    let totalG = 0
    let totalQ = 0
    model.members.forEach((m, mi) => {
      if (m.ref.kind !== 'beam') return
      totalG += -internal.memberLoads.G[mi].wy * m.length
      totalQ += -internal.memberLoads.Q[mi].wy * m.length
    })
    // g = (0,1·25 + 1,0)·16 = 56 kN; q = 2·16 = 32 kN — TUDO nas 3 vigas
    expect(totalG).toBeCloseTo(56, 4)
    expect(totalQ).toBeCloseTo(32, 4)
    expect(model.warnings.some((w) => w.includes('redistribuído'))).toBe(true)
  })
})

describe('checkConsistency', () => {
  it('modelo saudável não tem issues graves', () => {
    const issues = checkConsistency(twoColumnFrame())
    expect(issues.filter((i) => i.severity === 'grave')).toHaveLength(0)
  })

  it('sem pilares → grave', () => {
    const p = twoColumnFrame()
    p.columns = []
    const issues = checkConsistency(p)
    expect(issues.some((i) => i.severity === 'grave' && i.message.includes('sem pilares'))).toBe(
      true,
    )
  })

  it('pilares sobrepostos → grave', () => {
    const p = twoColumnFrame()
    p.columns.push({ ...p.columns[0], id: uid('col'), name: 'P9' })
    const issues = checkConsistency(p)
    expect(issues.some((i) => i.message.includes('sobrepostos'))).toBe(true)
  })

  it('viga sem apoio → grave; furo maior que a viga → grave', () => {
    const p = twoColumnFrame()
    p.plans[0].beams.push({
      id: uid('bm'),
      name: 'V9',
      path: [
        { x: 0, y: 2 },
        { x: 6, y: 2 },
      ],
      section: { bw: 0.2, h: 0.5 },
      openings: [{ id: uid('op'), x: 3, width: 0.1, height: 0.6, yOffset: 0 }],
    })
    const issues = checkConsistency(p)
    expect(issues.some((i) => i.message.includes('V9') && i.message.includes('sem apoio'))).toBe(
      true,
    )
    expect(issues.some((i) => i.message.includes('altura ≥ altura'))).toBe(true)
  })

  it('pilar nascendo fora da fundação sem viga → grave', () => {
    const p = twoColumnFrame()
    p.columns.push({
      id: uid('col'),
      name: 'PT1',
      pos: { x: 2, y: 2 },
      section: { bw: 0.2, h: 0.2 },
      rotationDeg: 0,
      baseLevelId: p.levels[1].id,
      topLevelId: p.levels[1].id, // topo = base → também grave
    })
    const issues = checkConsistency(p)
    expect(issues.filter((i) => i.severity === 'grave').length).toBeGreaterThan(0)
  })
})
