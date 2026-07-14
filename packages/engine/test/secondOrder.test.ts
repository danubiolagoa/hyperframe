import { beforeAll, describe, expect, it } from 'vitest'
import { createSampleProject } from '../src/model/factory'
import { analyze } from '../src/analyze'
import type { AnalysisResults } from '../src/analysis/types'

/**
 * Integração: desaprumo global (§11.3.3.4.1) e majoração 0,95·γz (§15.7.2)
 * no edifício exemplo (8 pavimentos, vento SP).
 */

describe('desaprumo global + 2ª ordem aproximada (integração)', () => {
  let results: AnalysisResults

  beforeAll(() => {
    results = analyze(createSampleProject())
  })

  it('desaprumo calculado e regra vento×desaprumo registrada por direção', () => {
    const imp = results.model.imperfections
    expect(imp).not.toBeNull()
    // θ1 clampado em [1/300, 1/200] e θa ≤ θ1
    expect(imp!.theta1).toBeGreaterThanOrEqual(1 / 300 - 1e-12)
    expect(imp!.theta1).toBeLessThanOrEqual(1 / 200 + 1e-12)
    expect(imp!.thetaA).toBeLessThanOrEqual(imp!.theta1 + 1e-12)
    expect(imp!.baseMoment).toBeGreaterThan(0)
    expect(imp!.rules).toHaveLength(4)
    for (const r of imp!.rules) {
      expect(['somente-vento', 'somente-desaprumo', 'vento+desaprumo']).toContain(r.rule)
      expect(r.mWind).toBeGreaterThan(0)
    }
  })

  it('lateral final por direção ≥ vento puro (desaprumo nunca reduz)', () => {
    for (const wd of results.model.wind!) {
      const rule = results.model.imperfections!.rules.find((r) => r.dir === wd.dir)!
      const mLateral = wd.perLevel.reduce((s, lf) => s + lf.F * lf.z, 0)
      if (rule.rule === 'somente-vento') {
        expect(mLateral).toBeCloseTo(rule.mWind, 6)
      } else if (rule.rule === 'vento+desaprumo') {
        expect(mLateral).toBeGreaterThan(rule.mWind)
      } else {
        // somente-desaprumo: lateral = desaprumo > vento/0,3... apenas positivo
        expect(mLateral).toBeGreaterThan(0)
      }
    }
  })

  it('secondOrder coerente com γz: fator = 0,95·γz apenas p/ nós móveis', () => {
    const so = results.stability.secondOrder
    expect(so.factors.length).toBe(results.stability.gammaZ.length)
    for (const f of so.factors) {
      const gz = results.stability.gammaZ.find((g) => g.dir === f.dir)!
      expect(f.gammaZ).toBeCloseTo(gz.value, 9)
      if (gz.classification === 'nos-moveis') {
        expect(f.factor).toBeCloseTo(Math.max(1, 0.95 * gz.value), 9)
      } else {
        expect(f.factor).toBe(1)
      }
    }
    // labels das combinações marcadas apenas quando houve majoração
    const marked = results.combos.some((c) => c.label.includes('0,95γz'))
    expect(marked).toBe(so.applied)
  })

  it('novos resultados presentes: escadas, reservatório e incêndio', () => {
    // o projeto exemplo tem ESC1 no tipo e RES1 na cobertura
    expect(results.stairDesign.length).toBeGreaterThanOrEqual(1)
    expect(results.stairDesign[0].design.as).toBeGreaterThan(0)
    expect(results.tankDesign.length).toBeGreaterThanOrEqual(1)
    expect(results.tankDesign[0].design.volume).toBeGreaterThan(0)
    expect(results.fire.enabled).toBe(true)
    // 8 pav × 2,88 = 23,04 m → residencial classe 23<h≤30 → TRRF 90
    expect(results.fire.trrfSuggested).toBe(90)
    expect(results.fire.items.length).toBeGreaterThan(10)
    expect(results.fire.items.some((i) => i.kind === 'pilar' && i.trf !== undefined)).toBe(true)
  })

  it('vigas com torção e pele nos resultados', () => {
    for (const bd of results.beamDesign) {
      expect(bd.torsion).toBeDefined()
      expect(bd.torsion.trd2).toBeGreaterThan(0)
      expect(bd.skin.required).toBe(false) // vigas 20×50 dispensam pele
    }
  })

  it('fissuração ELS-W presente nas vigas com momento em serviço', () => {
    const withCrack = results.beamService.filter((b) => b.crack !== null)
    expect(withCrack.length).toBeGreaterThan(0)
    for (const b of withCrack) {
      expect(b.crack!.wk).toBeGreaterThanOrEqual(0)
      expect(b.crack!.wkLimit).toBeCloseTo(0.3e-3, 12) // CAA II
    }
  })
})
