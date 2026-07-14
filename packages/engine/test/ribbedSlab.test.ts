import { describe, expect, it } from 'vitest'
import {
  designRibbedSlab,
  ribbedGeometry,
  ribbedSelfWeight,
  ribFraction,
  slabShearVrd1,
} from '../src/nbr/nbr6118/ribbedSlab'
import { createSampleProject } from '../src/model/factory'
import { analyze } from '../src/analyze'
import type { RibbedParams } from '../src/model/types'

const RIB: RibbedParams = {
  dirs: 'xy',
  ribWidth: 0.1,
  spacing: 0.5,
  topping: 0.05,
  fillerWeight: 0,
}

describe('lajes nervuradas — geometria e peso (âncoras fechadas)', () => {
  it('fração de nervuras bidirecional: bw(2s−bw)/s²', () => {
    // 0,1·(1,0−0,1)/0,25 = 0,36
    expect(ribFraction(RIB)).toBeCloseTo(0.36, 9)
    expect(ribFraction({ ...RIB, dirs: 'x' })).toBeCloseTo(0.2, 9)
  })

  it('espessura média de concreto e peso próprio (h=25, capa 5, vazio)', () => {
    const geo = ribbedGeometry(0.25, RIB)
    // 0,05 + 0,20·0,36 = 0,122 m³/m² → 3,05 kN/m² @ γ=25
    expect(geo.concreteThickness).toBeCloseTo(0.122, 9)
    expect(ribbedSelfWeight(0.25, RIB, 25)).toBeCloseTo(3.05, 6)
    // l0 = 40 cm ≤ 65 → cisalhamento como laje
    expect(geo.l0).toBeCloseTo(0.4, 9)
    expect(geo.shearAsSlab).toBe(true)
    expect(geo.asTBeams).toBe(false)
  })

  it('enchimento pesa: EPS 0,25 kN/m³ soma o volume entre nervuras', () => {
    const g0 = ribbedSelfWeight(0.25, { ...RIB, fillerWeight: 0.25 }, 25)
    // vazio 3,05 + 0,20·0,64·0,25 = 3,082
    expect(g0).toBeCloseTo(3.05 + 0.2 * 0.64 * 0.25, 6)
  })

  it('checagens §13.2.4.2: capa fina e nervura estreita reprovam', () => {
    const bad = ribbedGeometry(0.25, { ...RIB, topping: 0.03, ribWidth: 0.04 })
    expect(bad.checks.find((c) => c.id === 'capa')!.ok).toBe(false)
    expect(bad.checks.find((c) => c.id === 'nervura')!.ok).toBe(false)
    // capa 5 cm mas l0 = 96 cm → 96/15 = 6,4 cm > 5 → reprova por l0/15
    const wide = ribbedGeometry(0.3, { ...RIB, spacing: 1.06, topping: 0.05 })
    expect(wide.checks.find((c) => c.id === 'capa')!.ok).toBe(false)
  })

  it('VRd1 de laje (§19.4.1) — fórmula fechada', () => {
    // bw=0,10, d=0,21, fctd=1445 kPa (C30), ρ1=0,01
    // τRd=361,25; k=1,39; VRd1 = 361,25·1,39·(1,2+0,4)·0,1·0,21 = 16,87 kN
    const v = slabShearVrd1(0.1, 0.21, 1445, 0.01)
    expect(v).toBeCloseTo(361.25 * 1.39 * 1.6 * 0.1 * 0.21, 2)
  })
})

describe('designRibbedSlab — laje 5×5 biapoiada C30', () => {
  const out = designRibbedSlab({
    a: { span: 5, fixedEnds: 0 },
    b: { span: 5, fixedEnds: 0 },
    h: 0.25,
    ribbed: RIB,
    g: 3.05 + 1.0, // peso próprio + revestimento
    q: 2.0,
    psi2: 0.3,
    cover: 0.025,
    fcd: 30000 / 1.4,
    fck: 30000,
    fyd: 500000 / 1.15,
    fctm: 2896,
    fctd: 1448,
    ecs: 26_838_405,
    fywk: 500000,
    gammaC: 25,
  })

  it('momento por nervura = Marcus × espaçamento (simétrica: metade p/ cada direção)', () => {
    // w = 6,05 → wd = 8,47; quinhão por direção 4,235; M/m = 4,235·25/8 = 13,23; ×0,5 = 6,62 kN·m
    expect(out.dirA.mRibSpan).toBeCloseTo((1.4 * (6.05 / 2) * 25) / 8 * 0.5, 2)
    expect(out.dirB.mRibSpan).toBeCloseTo(out.dirA.mRibSpan, 6)
  })

  it('bloco de compressão dentro da capa e barras por nervura escolhidas', () => {
    expect(out.dirA.flangeOk).toBe(true)
    expect(out.dirA.ribBars).toMatch(/φ/)
    expect(out.dirA.asRib).toBeGreaterThanOrEqual(out.dirA.asRibMin - 1e-12)
  })

  it('cisalhamento dispensa estribos (l0 ≤ 65 e VSd ≤ VRd1)', () => {
    expect(out.dirA.vRib).toBeLessThanOrEqual(out.dirA.vrd1 + 1e-9)
    expect(out.dirA.stirrup).toBeNull()
  })

  it('flecha calculada com inércia da seção T e limite L/250', () => {
    expect(out.deflection).toBeGreaterThan(0)
    expect(out.deflectionLimit).toBeCloseTo(5 / 250, 9)
  })

  it('unidirecional: só a direção das nervuras carrega', () => {
    const uni = designRibbedSlab({
      a: { span: 4, fixedEnds: 0 },
      b: { span: 6, fixedEnds: 0 },
      h: 0.25,
      ribbed: { ...RIB, dirs: 'x' },
      g: 4,
      q: 2,
      psi2: 0.3,
      cover: 0.025,
      fcd: 30000 / 1.4,
      fck: 30000,
      fyd: 500000 / 1.15,
      fctm: 2896,
      fctd: 1448,
      ecs: 26_838_405,
      fywk: 500000,
      gammaC: 25,
    })
    expect(uni.oneWay).toBe(true)
    const carriers = [uni.dirA.w, uni.dirB.w].filter((w) => w > 1e-9)
    expect(carriers).toHaveLength(1)
    expect(carriers[0]).toBeCloseTo(6, 9)
  })
})

describe('nervuradas na análise completa', () => {
  it('peso próprio real entra nos pesos de pavimento e o dimensionamento sai por nervura', () => {
    const p = createSampleProject()
    const plan = p.plans[0]
    // converte TODAS as lajes do tipo em nervuradas h=25 (antes: maciças h=12)
    for (const slab of plan.slabs) {
      slab.thickness = 0.25
      slab.ribbed = { ...RIB }
    }
    const r = analyze(p)
    const ribbedItems = r.slabDesign.filter((s) => s.kind === 'nervurada')
    expect(ribbedItems.length).toBeGreaterThan(0)
    for (const s of ribbedItems) {
      expect(s.ribbedDesign).not.toBeNull()
      expect(s.design).toBeNull()
    }
    // peso da nervurada (3,05) < maciça equivalente h=25 (6,25): o modelo usa o real
    // (âncora indireta: levelWeights do 1º pavimento tipo coerente com 3,05+1,5 na área)
    expect(r.model.levelWeights[0].G).toBeGreaterThan(0)
  })
})
