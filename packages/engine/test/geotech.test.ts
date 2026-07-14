import { describe, expect, it } from 'vitest'
import {
  averageModulus,
  footingSprings,
  pileCapacityAokiVelloso,
  pileCapSprings,
  pileLayout,
  soilModulus,
} from '../src/geotech/soil'
import { createEmptyProject, createSampleProject } from '../src/model/factory'
import { uid } from '../src/model/uid'
import { buildAnalysisModel } from '../src/analysis/buildModel'
import { numberDofs, solvePass } from '../src/analysis/solve'
import { analyze } from '../src/analyze'
import type { SoilInteractionParams } from '../src/model/types'

const SOIL: SoilInteractionParams = {
  enabled: true,
  layers: [
    { thickness: 3, soil: 'argila-arenosa', nspt: 8 },
    { thickness: 7, soil: 'areia', nspt: 20 },
  ],
  waterDepth: null,
  chFactor: 0.5,
  poisson: 0.3,
}

describe('correlações com SPT (Teixeira & Godoy)', () => {
  it('Es = α·K·NSPT — areia N=20 → 54 MPa', () => {
    expect(soilModulus('areia', 20)).toBeCloseTo(3 * 0.9 * 1000 * 20, 6)
  })
  it('Es = α·K·NSPT — argila N=10 → 14 MPa', () => {
    expect(soilModulus('argila', 10)).toBeCloseTo(7 * 0.2 * 1000 * 10, 6)
  })
  it('média ponderada em profundidade', () => {
    // 2 m na argila-arenosa (Es = 7·0,3·8 = 16,8 MPa): média = 16800
    expect(averageModulus(SOIL.layers, 2)).toBeCloseTo(16800, 3)
    // 4 m: 3 m argila (16800) + 1 m areia (54000) → (3·16800 + 54000)/4
    expect(averageModulus(SOIL.layers, 4)).toBeCloseTo((3 * 16800 + 54000) / 4, 3)
  })
})

describe('Aoki–Velloso — âncora manual (hélice ø40, L=10 m)', () => {
  // Ap = π·0,4²/4 = 0,12566 m²; U = π·0,4 = 1,2566 m; F1=2, F2=4
  // fuste: argila-arenosa (α=0,024, K=350, N=8, 3 m) + areia (α=0,014, K=1000, N=20, 7 m)
  // ponta na areia: qp = 1000·20/2 = 10000 kPa
  const cap = pileCapacityAokiVelloso(
    { pileDiameter: 0.4, pileKind: 'helice', pileLength: 10 },
    SOIL.layers,
  )
  it('atrito lateral por camada', () => {
    const u = Math.PI * 0.4
    const shaft1 = (u * 0.024 * 350 * 8 * 3) / 4
    const shaft2 = (u * 0.014 * 1000 * 20 * 7) / 4
    expect(cap.shaft).toBeCloseTo(shaft1 + shaft2, 3)
  })
  it('ponta e admissível (FS=2)', () => {
    expect(cap.tip).toBeCloseTo(10000 * ((Math.PI * 0.16) / 4), 3)
    expect(cap.admissible).toBeCloseTo(cap.ultimate / 2, 9)
    expect(cap.nTip).toBe(20)
  })
})

describe('molas de fundação', () => {
  it('sapata 2×2 sobre areia N=20: kv = A·Es/(B(1−ν²)Iw)', () => {
    const uniformSand: SoilInteractionParams = {
      ...SOIL,
      layers: [{ thickness: 10, soil: 'areia', nspt: 20 }],
    }
    const s = footingSprings(2, 2, uniformSand, true)
    const es = 54000
    const kvExpected = (4 * es) / (2 * (1 - 0.09) * 0.88)
    expect(s.kv).toBeCloseTo(kvExpected, 1)
    expect(s.kh).toBeCloseTo(0.5 * kvExpected, 1)
    // ks·I com I = 2·2³/12
    expect(s.krx).toBeCloseTo((kvExpected / 4) * ((2 * 8) / 12), 1)
    expect(s.kry).toBeCloseTo(s.krx, 6) // quadrada
  })
  it('layouts de estacas 1–5', () => {
    expect(pileLayout(1, 1.2)).toHaveLength(1)
    expect(pileLayout(2, 1.2)).toHaveLength(2)
    expect(pileLayout(3, 1.2)).toHaveLength(3)
    expect(pileLayout(4, 1.2)).toHaveLength(4)
    expect(pileLayout(5, 1.2)).toHaveLength(5)
    // 4 estacas: braços ±e/2
    const l4 = pileLayout(4, 1.2)
    expect(Math.max(...l4.map((p) => Math.abs(p.a)))).toBeCloseTo(0.6, 9)
  })
  it('bloco de 4 estacas: kv = 4·kv_estaca e rotacional > flexão isolada', () => {
    const s = pileCapSprings(
      4,
      1.2,
      {
        type: 'estacas',
        pileCapacity: 600,
        pileDiameter: 0.4,
        pileSpacingFactor: 3,
        pileLabel: 'Hélice ø40',
        pileKind: 'helice',
        pileLength: 10,
      },
      SOIL,
      true,
    )
    expect(s.kv).toBeGreaterThan(0)
    expect(s.krx).toBeGreaterThan(0)
    // com braços, a mola rotacional deve superar em muito a flexão das estacas
    const s1 = pileCapSprings(
      1,
      1.2,
      {
        type: 'estacas',
        pileCapacity: 600,
        pileDiameter: 0.4,
        pileSpacingFactor: 3,
        pileLabel: 'Hélice ø40',
        pileKind: 'helice',
        pileLength: 10,
      },
      SOIL,
      true,
    )
    expect(s.krx).toBeGreaterThan(10 * s1.krx)
    expect(s.kv).toBeCloseTo(4 * s1.kv, 3)
  })
})

describe('apoios elásticos no solver', () => {
  it('recalque = N/kv num pilar isolado sobre mola vertical', () => {
    const p = createEmptyProject({
      name: 'Mola',
      fck: 30000,
      aggregate: 'granito',
      caa: 'II',
      numFloors: 1,
      floorHeight: 3,
      wind: { enabled: false, v0: 40, s1: 1, category: 4, s3Group: 2 },
      createdAt: '2026-01-01',
    })
    p.settings.considerSelfWeight = false
    p.columns = [
      {
        id: uid('col'),
        name: 'P1',
        pos: { x: 0, y: 0 },
        section: { bw: 0.3, h: 0.3 },
        rotationDeg: 0,
        baseLevelId: p.levels[0].id,
        topLevelId: p.levels[1].id,
      },
    ]
    const { model, internal } = buildAnalysisModel(p)
    const base = model.nodes.find((n) => n.support)!
    const top = model.nodes.find((n) => !n.support && n.kind === 'structural')!
    const kv = 50_000 // kN/m
    base.springs = [1e6, 1e6, kv, 1e5, 1e5, 1e5]
    internal.nodalLoads.G.push({ node: top.id, dof: 2, value: -100 })
    const system = numberDofs(model)
    const res = solvePass(p, model, internal, system, { beams: 1, columns: 1, useEci: false }, [
      'G',
    ])
    const uzBase = res.G!.displacements[base.id][2]
    expect(uzBase).toBeCloseTo(-100 / kv, 8)
    // reação vertical = 100 kN
    const r = res.G!.reactions.find((x) => x.nodeId === base.id)!
    expect(r.fz).toBeCloseTo(100, 6)
  })
})

describe('analyze — interação solo-estrutura de ponta a ponta', () => {
  it('molas atribuídas, recalques > 0 e equilíbrio mantido', () => {
    const p = createSampleProject()
    p.settings.soilInteraction = { ...SOIL, enabled: true }
    const r = analyze(p)
    expect(r.soilInteraction.enabled).toBe(true)
    expect(r.soilInteraction.items).toHaveLength(p.columns.length)
    expect(r.soilInteraction.maxSettlement).toBeGreaterThan(0)
    // recalques da ordem de mm (não µm, não m)
    expect(r.soilInteraction.maxSettlement).toBeGreaterThan(1e-4)
    expect(r.soilInteraction.maxSettlement).toBeLessThan(0.15)
    // equilíbrio ΣFz = peso total continua valendo com molas
    const g = r.cases.elu.G!
    const sumFz = g.reactions.reduce((s, x) => s + x.fz, 0)
    const totalG = r.model.levelWeights.reduce((s, lw) => s + lw.G, 0)
    expect(sumFz).toBeCloseTo(totalG, 0)
    // γz com molas ≥ γz engastado (estrutura mais flexível)
    expect(r.stability.gammaZ.length).toBeGreaterThan(0)
  })
})
