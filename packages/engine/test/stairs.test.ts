import { describe, expect, it } from 'vitest'
import { designStair } from '../src/nbr/nbr6118/stairs'

function relErr(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

// ---------------------------------------------------------------------------
// Escada — lance biapoiado (âncora à mão)
// L = 3,0 m · t = 12 cm · e/p = 17,5/27 cm · rev. 1,0 · q = 2,5 · C25 · CA-50
// ---------------------------------------------------------------------------

const BASE = {
  span: 3.0,
  waist: 0.12,
  riser: 0.175,
  tread: 0.27,
  finish: 1.0,
  q: 2.5,
  unitWeight: 25,
  cover: 0.025,
  fck: 25_000,
  fcd: 17_857.1,
  fyd: 434_782.6,
  fctm: 2565,
  ecs: 2.415e7,
  psi2: 0.3,
}

describe('designStair (lance como laje armada em uma direção)', () => {
  it('cargas: g = 25·t/cosθ + 25·e/2 + rev = 6,763 kN/m²', () => {
    const r = designStair(BASE)
    // θ = atan(17,5/27) = 32,94°
    expect(relErr(r.thetaDeg, 32.94)).toBeLessThan(1e-3)
    expect(relErr(r.g, 6.7626)).toBeLessThan(1e-3)
    expect(r.q).toBe(2.5)
  })

  it('esforços: Md = 1,4(g+q)L²/8 = 14,59 kN·m/m · Vd = 19,45 kN/m', () => {
    const r = designStair(BASE)
    expect(relErr(r.md, 14.589)).toBeLessThan(1e-3)
    expect(relErr(r.vd, 19.452)).toBeLessThan(1e-3)
  })

  it('armadura: As = 3,98 cm²/m (d = 9 cm) e distribuição ≥ 20%', () => {
    const r = designStair(BASE)
    expect(relErr(r.as, 3.98e-4)).toBeLessThan(0.01)
    expect(r.asDist).toBeGreaterThanOrEqual(0.2 * r.as - 1e-12)
    expect(r.spec).toContain('φ')
    expect(r.ok).toBe(true)
  })

  it('flecha: elástica 2,28 mm × (1+1,32) = 5,29 mm ≤ L/250 (não fissura)', () => {
    const r = designStair(BASE)
    expect(relErr(r.deflection, 5.286e-3)).toBeLessThan(0.01)
    expect(r.deflectionLimit).toBeCloseTo(0.012, 9)
  })

  it('Blondel p+2e = 62 cm dentro de 60–65', () => {
    const r = designStair(BASE)
    expect(relErr(r.blondel, 62)).toBeLessThan(1e-9)
    expect(r.blondelOk).toBe(true)
  })

  it('degraus desconfortáveis → nota de Blondel', () => {
    // p + 2e = 32 + 2·20 = 72 cm > 65
    const r = designStair({ ...BASE, riser: 0.2, tread: 0.32 })
    expect(r.blondelOk).toBe(false)
    expect(r.notes.some((n) => n.includes('Blondel'))).toBe(true)
  })

  it('vão grande sem aumentar espessura → falha por flecha', () => {
    const r = designStair({ ...BASE, span: 5.5 })
    expect(r.ok).toBe(false)
    expect(r.deflection).toBeGreaterThan(r.deflectionLimit)
  })
})
