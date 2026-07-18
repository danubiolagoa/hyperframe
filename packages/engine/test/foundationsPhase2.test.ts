import { describe, expect, it } from 'vitest'
import { designPileCap } from '../src/nbr/nbr6118/pileCaps'
import { designCombinedFooting } from '../src/nbr/nbr6118/combinedFooting'
import { pileLayout, pileGridDims } from '../src/geotech/soil'
import { foundationShape } from '../src/design/foundationGeometry'
import { buildFoundationPlanDrawing } from '../src/drawing/foundationPlan'
import { buildFoundationDetailDrawing } from '../src/drawing/foundationDetail'
import { createSampleProject } from '../src/model/factory'
import type { FoundationResultItem } from '../src/analysis/types'

// ---------------------------------------------------------------------------
// Fase 2b: blocos 6–16 estacas (CEB-70, malha S1/S2) + sapatas associadas
// ---------------------------------------------------------------------------

describe('pileLayout ≥ 6 (malha retangular)', () => {
  it('6 estacas → 2×3, e = 1,2 m: extremos ±1,2/±0,6, CG na origem', () => {
    expect(pileGridDims(6)).toEqual({ rows: 2, cols: 3 })
    const l = pileLayout(6, 1.2)
    expect(l).toHaveLength(6)
    expect(Math.max(...l.map((p) => p.a))).toBeCloseTo(1.2, 6)
    expect(Math.max(...l.map((p) => p.b))).toBeCloseTo(0.6, 6)
    expect(l.reduce((s, p) => s + p.a, 0)).toBeCloseTo(0, 9)
    expect(l.reduce((s, p) => s + p.b, 0)).toBeCloseTo(0, 9)
  })

  it('9 estacas → 3×3; layouts 1–5 preservados', () => {
    expect(pileGridDims(9)).toEqual({ rows: 3, cols: 3 })
    expect(pileLayout(9, 1)).toHaveLength(9)
    expect(pileLayout(5, 1.2)).toHaveLength(5)
    expect(pileLayout(2, 1.2)[0].a).toBeCloseTo(-0.6, 6)
  })
})

describe('designPileCap CEB (6–16 estacas)', () => {
  const BASE = {
    ap: 0.6,
    bp: 0.25,
    pileCapacity: 300,
    pileDiameter: 0.4,
    spacingFactor: 3,
    fcd: 17_857.1,
    fyd: 434_782.6,
  }

  it('âncora 2×3: N=1600 → 6 est., h=0,90 (rígido §22.7.1), M_S1=739 kN·m → As=20,6 cm²', () => {
    // e = 1,2 · planA = 2·1,2+0,7 = 3,1 · planB = 1,2+0,7 = 1,9
    // h = (3,1−0,6)/3 + d' = 0,893 → 0,90 · d = 0,84
    // S1 dir A: x = 0,35·0,6 = 0,21; 2 estacas a 1,2 m: M = 2·(2240/6)·0,99 = 739,2
    const r = designPileCap({ nServ: 1600, ...BASE })
    expect(r.nPiles).toBe(6)
    expect(r.e).toBeCloseTo(1.2, 6)
    expect(r.planA).toBeCloseTo(3.1, 6)
    expect(r.planB).toBeCloseTo(1.9, 6)
    expect(r.h).toBeCloseTo(0.9, 6)
    expect(r.pileLoad).toBeCloseTo((1.05 * 1600) / 6, 1)
    expect(r.asMain).toBeCloseTo(20.6e-4, 3)
    expect(r.status).toBe('ok')
    expect(r.notes.join(' ')).toMatch(/CEB-70/)
    expect(r.notes.join(' ')).toMatch(/malha 2×3/)
    expect(r.notes.join(' ')).toMatch(/M=739/)
  })

  it('nPilesFixed=8 em carga de 6 ⇒ verificação passa; capacidade estourada ⇒ falha', () => {
    const ok = designPileCap({ nServ: 1600, ...BASE, nPilesFixed: 8 })
    expect(ok.nPiles).toBe(8)
    expect(ok.pileLoad).toBeLessThan(BASE.pileCapacity)
    const bad = designPileCap({ nServ: 3000, ...BASE, nPilesFixed: 6 })
    expect(bad.pileLoad).toBeGreaterThan(BASE.pileCapacity)
    expect(bad.status).toBe('falha')
  })
})

describe('designCombinedFooting (sapata associada)', () => {
  const BASE = {
    ap1: 0.25,
    bp1: 0.6,
    ap2: 0.25,
    bp2: 0.6,
    sigmaAdm: 200,
    fck: 25_000,
    fcd: 17_857.1,
    fyd: 434_782.6,
  }

  it('âncora simétrica: 2×500 kN, L=3 → 3,65×1,45 · σ=198 · M−=308 · M+=15,2', () => {
    // R = 1050 · xg = 1,5 · a = 2·1,5+0,25+0,4 = 3,65 · b = 5,25/3,65 → 1,45
    // w = 287,67 · c = 0,325 · M+ = w·c²/2 = 15,2 · M−(x=1,825) = 479,1−787,5 = −308,4
    const r = designCombinedFooting({ n1Serv: 500, n2Serv: 500, L: 3, ...BASE })
    expect(r.a).toBeCloseTo(3.65, 6)
    expect(r.b).toBeCloseTo(1.45, 6)
    expect(r.xg).toBeCloseTo(1.5, 6)
    expect(r.sigma).toBeCloseTo(198.4, 0)
    expect(r.mHog).toBeCloseTo(308.4, 0)
    expect(r.mSag).toBeCloseTo(15.2, 0)
    expect(r.h).toBeCloseTo(0.5, 6)
    expect(r.asTop).toBeCloseTo(23.8e-4, 3)
    expect(r.status).toBe('ok')
    expect(r.notes.join(' ')).toMatch(/superior ENTRE os pilares/i)
  })

  it('assimétrica: CG desloca (xg = 1,0) e a sapata ainda cobre os dois eixos', () => {
    const r = designCombinedFooting({ n1Serv: 800, n2Serv: 400, L: 3, ...BASE })
    expect(r.xg).toBeCloseTo(1.0, 6)
    expect(r.a).toBeCloseTo(2 * 2 + 0.25 + 0.4, 6) // cobre o eixo mais distante
    expect(r.notes.join(' ')).not.toMatch(/muito próxima/)
    expect(r.mHog).toBeGreaterThan(0)
  })

  it('fixada menor que o necessário ⇒ σ > σadm e falha', () => {
    const r = designCombinedFooting({
      n1Serv: 500,
      n2Serv: 500,
      L: 3,
      ...BASE,
      fixed: { a: 3.4, b: 1.0 },
    })
    expect(r.sigma).toBeGreaterThan(200)
    expect(r.status).toBe('falha')
    expect(r.notes.join(' ')).toMatch(/fixadas manualmente/i)
  })
})

describe('geometria e desenhos da associada', () => {
  const project = createSampleProject()
  const c1 = project.columns[0]
  const c2 = project.columns[1]
  const L = Math.hypot(c2.pos.x - c1.pos.x, c2.pos.y - c1.pos.y)
  const cf = designCombinedFooting({
    n1Serv: 500,
    n2Serv: 500,
    L,
    ap1: 0.25,
    bp1: 0.6,
    ap2: 0.25,
    bp2: 0.6,
    sigmaAdm: 200,
    fck: 25_000,
    fcd: 17_857.1,
    fyd: 434_782.6,
  })
  const owner: FoundationResultItem = {
    columnId: c1.id,
    name: c1.name,
    nServ: 500,
    kind: 'sapata',
    manual: true,
    footing: null,
    combined: { ...cf, partnerId: c2.id, partnerName: c2.name, L },
    pileCap: null,
    caisson: null,
    status: cf.status,
  }
  const secondary: FoundationResultItem = {
    columnId: c2.id,
    name: c2.name,
    nServ: 500,
    kind: 'sapata',
    manual: true,
    footing: null,
    combinedWithId: c1.id,
    pileCap: null,
    caisson: null,
    status: cf.status,
  }

  it('foundationShape: retângulo no CG entre os pilares; secundário sem geometria', () => {
    const s = foundationShape(owner, c1, c2)!
    expect(s.polygon).toHaveLength(4)
    const midX = c1.pos.x + ((c2.pos.x - c1.pos.x) * cf.xg) / L
    expect(s.center.x).toBeCloseTo(midX, 6)
    expect(s.dims).toContain(c2.name)
    expect(foundationShape(secondary, c2)).toBeNull()
  })

  it('planta: rótulo SA + resumo aponta o dono no secundário', () => {
    const d = buildFoundationPlanDrawing(project, [owner, secondary])
    const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(texts.some((t) => t.startsWith('SA'))).toBe(true)
    expect(texts.some((t) => t.includes(`associada c/ ${c1.name}`))).toBe(true)
  })

  it('detalhamento: armaduras superior/inferior/transversal da associada', () => {
    const d = buildFoundationDetailDrawing(project, [owner, secondary])
    const texts = d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(texts.some((t) => t.includes('long. SUPERIOR (entre pilares)'))).toBe(true)
    expect(texts.some((t) => t.includes('transversal inferior'))).toBe(true)
  })
})
