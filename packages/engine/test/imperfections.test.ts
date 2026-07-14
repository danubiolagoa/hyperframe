import { describe, expect, it } from 'vitest'
import { notionalLoads, windNotionalRule } from '../src/nbr/nbr6118/imperfections'

/** erro relativo |actual/expected − 1| */
function relErr(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

// ---------------------------------------------------------------------------
// NBR 6118 §11.3.3.4.1 — desaprumo global
// ---------------------------------------------------------------------------

describe('notionalLoads (desaprumo — NBR 6118 §11.3.3.4.1)', () => {
  it('θ1 = 1/(100√H) com limites 1/300 ≤ θ1 ≤ 1/200', () => {
    // H = 4 m → 1/(100·2) = 1/200 (exato no limite superior)
    expect(relErr(notionalLoads(4, 4, []).theta1, 1 / 200)).toBeLessThan(1e-9)
    // H = 1 m → 1/100 → clamp p/ 1/200
    expect(relErr(notionalLoads(1, 4, []).theta1, 1 / 200)).toBeLessThan(1e-9)
    // H = 25 m → 1/500 → clamp p/ 1/300
    expect(relErr(notionalLoads(25, 4, []).theta1, 1 / 300)).toBeLessThan(1e-9)
    // H = 6,25 m → 1/250 (sem clamp)
    expect(relErr(notionalLoads(6.25, 4, []).theta1, 1 / 250)).toBeLessThan(1e-9)
  })

  it('θa = θ1·√((1+1/n)/2) — âncora H=23,04 m, n=12', () => {
    const r = notionalLoads(23.04, 12, [])
    // θ1 = 1/480 → clamp 1/300 · θa = (1/300)·√(13/24) = 2,4533e-3
    expect(relErr(r.theta1, 1 / 300)).toBeLessThan(1e-9)
    expect(relErr(r.thetaA, 2.4533e-3)).toBeLessThan(1e-4)
  })

  it('forças por nível Fi = θa·Pi e momento na base ΣFi·zi', () => {
    const r = notionalLoads(23.04, 12, [
      { levelIndex: 1, z: 2.88, weight: 3000 },
      { levelIndex: 2, z: 5.76, weight: 3000 },
    ])
    expect(relErr(r.perLevel[0].F, 2.4533e-3 * 3000)).toBeLessThan(1e-4)
    const expectedM = 2.4533e-3 * 3000 * (2.88 + 5.76)
    expect(relErr(r.baseMoment, expectedM)).toBeLessThan(1e-4)
  })

  it('n = 1 prumada → θa = θ1 (√((1+1)/2) = 1)', () => {
    const r = notionalLoads(9, 1, [])
    expect(relErr(r.thetaA, r.theta1)).toBeLessThan(1e-12)
  })
})

describe('windNotionalRule (§11.3.3.4.1 c)', () => {
  it('30% do vento ≥ desaprumo → somente vento', () => {
    expect(windNotionalRule(100, 30)).toBe('somente-vento')
    expect(windNotionalRule(100, 25)).toBe('somente-vento')
  })
  it('vento < 30% do desaprumo → somente desaprumo', () => {
    expect(windNotionalRule(50, 200)).toBe('somente-desaprumo')
  })
  it('casos intermediários → vento + desaprumo', () => {
    expect(windNotionalRule(100, 150)).toBe('vento+desaprumo')
    expect(windNotionalRule(100, 100)).toBe('vento+desaprumo')
  })
})
