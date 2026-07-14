import { describe, expect, it } from 'vitest'
import { designTank } from '../src/nbr/nbr6118/tanks'

function relErr(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

// ---------------------------------------------------------------------------
// Reservatório 2,5×2,5 m · lâmina 1,5 m · paredes/fundo 15 cm · tampa 10 cm
// ---------------------------------------------------------------------------

const BASE = {
  a: 2.5,
  b: 2.5,
  waterHeight: 1.5,
  wallThickness: 0.15,
  bottomThickness: 0.15,
  topThickness: 0.1,
  finish: 1.0,
  unitWeight: 25,
  cover: 0.025,
  fck: 25_000,
  fcd: 17_857.1,
  fyd: 434_782.6,
  fctm: 2565,
  ecs: 2.415e7,
  es: 210_000_000,
  psi2: 0.3,
}

describe('designTank (caixa d’água retangular apoiada)', () => {
  it('parede: Mk = γw·hw³/6 = 5,625 kN·m/m · Md = 7,875', () => {
    const r = designTank(BASE)
    expect(relErr(r.wall.mk, 5.625)).toBeLessThan(1e-9)
    expect(relErr(r.wall.md, 7.875)).toBeLessThan(1e-9)
  })

  it('estanqueidade: wk ≤ 0,2 mm com armadura ampliada se preciso', () => {
    const r = designTank(BASE)
    expect(r.wall.wkLimit).toBeCloseTo(0.2e-3, 12)
    expect(r.wall.wk).toBeLessThanOrEqual(r.wall.wkLimit + 1e-9)
    expect(r.wall.ok).toBe(true)
    // cobrimento interno mínimo de 3 cm força d = t − 3,5 cm
    expect(r.wall.as).toBeGreaterThanOrEqual(0.0015 * 0.15 - 1e-12) // ≥ ρmin·t
  })

  it('fundo engastado no contorno com coluna d’água · tampa apoiada', () => {
    const r = designTank(BASE)
    expect(r.bottom.dirA.fixedEnds).toBe(2)
    expect(r.bottom.dirA.mSupportD).toBeGreaterThan(0)
    // carga do fundo inclui γw·hw = 15 kN/m² como variável
    expect(r.bottom.dirA.w + r.bottom.dirB.w).toBeGreaterThan(15)
    expect(r.top.dirA.fixedEnds).toBe(0)
    expect(r.top.dirA.mSupportD).toBe(0)
  })

  it('volume e peso total: V = 9,375 m³ · G+água coerentes', () => {
    const r = designTank(BASE)
    expect(relErr(r.volume, 9.375)).toBeLessThan(1e-9)
    // água = 93,75 kN; estrutura > 60 kN (fundo+tampa+4 paredes)
    expect(r.totalWeight).toBeGreaterThan(93.75 + 50)
    expect(r.ok).toBe(true)
  })

  it('lâmina alta com parede fina → não atende estanqueidade', () => {
    const r = designTank({ ...BASE, waterHeight: 3.0, wallThickness: 0.12 })
    expect(r.wall.ok).toBe(false)
    expect(r.notes.some((n) => n.includes('espessura'))).toBe(true)
  })
})
