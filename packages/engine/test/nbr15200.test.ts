import { describe, expect, it } from 'vitest'
import {
  checkBeamFire,
  checkColumnFire,
  checkSlabFire,
  requiredTRRF,
} from '../src/nbr/nbr15200/fire'

function relErr(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

// ---------------------------------------------------------------------------
// NBR 14432 tab. A.1 — TRRF por ocupação × altura
// ---------------------------------------------------------------------------

describe('requiredTRRF (NBR 14432)', () => {
  it('residencial (A): 30/30/60/90/120 pelas classes de altura', () => {
    expect(requiredTRRF('A', 5)).toBe(30)
    expect(requiredTRRF('A', 10)).toBe(30)
    expect(requiredTRRF('A', 20)).toBe(60)
    expect(requiredTRRF('A', 28)).toBe(90)
    expect(requiredTRRF('A', 45)).toBe(120)
  })
  it('comercial (C) exige 60 min já em baixa altura', () => {
    expect(requiredTRRF('C', 5)).toBe(60)
    expect(requiredTRRF('F', 5)).toBe(60)
  })
  it('hospedagem/saúde (B/H): 30/60/60/90/120', () => {
    expect(requiredTRRF('B', 8)).toBe(60)
    expect(requiredTRRF('H', 8)).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// NBR 15200:2012 tab. 4/5 — vigas
// ---------------------------------------------------------------------------

describe('checkBeamFire (método tabular)', () => {
  it('biapoiada TRRF 60: combinações 120/40 · 160/35 · 190/30 · 300/25', () => {
    expect(checkBeamFire(120, 40, 60, false).ok).toBe(true)
    expect(checkBeamFire(120, 39, 60, false).ok).toBe(false)
    expect(checkBeamFire(160, 35, 60, false).c1Required).toBeCloseTo(35, 9)
    expect(checkBeamFire(300, 25, 60, false).ok).toBe(true)
    // interpolação linear: bw = 140 → c1req = 37,5
    expect(checkBeamFire(140, 38, 60, false).c1Required).toBeCloseTo(37.5, 9)
  })

  it('largura menor que a mínima da tabela → reprova', () => {
    const r = checkBeamFire(100, 60, 60, false)
    expect(r.ok).toBe(false)
    expect(r.notes.some((n) => n.includes('mínimo'))).toBe(true)
  })

  it('acima da última combinação → c1 da última coluna', () => {
    expect(checkBeamFire(400, 25, 60, false).c1Required).toBeCloseTo(25, 9)
  })

  it('contínua TRRF 90: 140/37 · 250/25 (com interpolação)', () => {
    expect(checkBeamFire(140, 37, 90, true).ok).toBe(true)
    expect(checkBeamFire(140, 36, 90, true).ok).toBe(false)
    // bw = 195 → 37 + (25−37)·55/110 = 31
    expect(relErr(checkBeamFire(195, 32, 90, true).c1Required, 31)).toBeLessThan(1e-9)
  })

  it('contínuas exigem menos que biapoiadas (mesmo TRRF)', () => {
    const cont = checkBeamFire(190, 12, 60, true)
    const bi = checkBeamFire(190, 12, 60, false)
    expect(cont.ok).toBe(true)
    expect(bi.ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// NBR 15200:2012 tab. 6/7 — lajes apoiadas em vigas
// ---------------------------------------------------------------------------

describe('checkSlabFire (método tabular)', () => {
  it('TRRF 60: h ≥ 80 e c1 por λ (10/15/20)', () => {
    expect(checkSlabFire(100, 10, 60, 1.4, false).ok).toBe(true)
    expect(checkSlabFire(100, 14, 60, 1.8, false).ok).toBe(false)
    expect(checkSlabFire(100, 15, 60, 1.8, false).ok).toBe(true)
    expect(checkSlabFire(100, 20, 60, 2.5, false).c1Required).toBe(20)
  })
  it('espessura corta-fogo: TRRF 90 exige h ≥ 100', () => {
    const r = checkSlabFire(90, 30, 90, 1.2, false)
    expect(r.ok).toBe(false)
    expect(r.hMin).toBe(100)
  })
  it('lajes contínuas: c1 = 10/10/15/20/30', () => {
    expect(checkSlabFire(120, 10, 60, 1.0, true).ok).toBe(true)
    expect(checkSlabFire(120, 15, 90, 1.0, true).c1Required).toBe(15)
    expect(checkSlabFire(120, 20, 120, 1.0, true).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// NBR 15200:2012 §8.4 — pilares (método analítico)
// ---------------------------------------------------------------------------

describe('checkColumnFire (método analítico)', () => {
  it('âncora: 19×19, μfi=0,7, c1=40, lef,fi=2 m, 4 barras → TRF = 67 min', () => {
    const r = checkColumnFire(
      { b: 190, h: 190, c1: 40, lefFi: 2, muFi: 0.7, nBars: 4 },
      60,
    )
    // Rμ=24,9 · Ra=16 · Rl=28,8 · Rb=17,1 · Rn=0 → TRF = 120·(86,8/120)^1,8
    expect(relErr(r.trf, 66.99)).toBeLessThan(2e-3)
    expect(r.ok).toBe(true)
  })

  it('mais de 4 barras soma Rn = 12', () => {
    const base = { b: 190, h: 190, c1: 40, lefFi: 2, muFi: 0.7 }
    const r4 = checkColumnFire({ ...base, nBars: 4 }, 60)
    const r8 = checkColumnFire({ ...base, nBars: 8 }, 60)
    expect(r8.trf).toBeGreaterThan(r4.trf)
  })

  it('b′ < 190 mm → fora do método (falha com nota)', () => {
    const r = checkColumnFire({ b: 140, h: 200, c1: 40, lefFi: 2, muFi: 0.5, nBars: 4 }, 30)
    expect(r.ok).toBe(false)
    expect(r.notes.some((n) => n.includes('190'))).toBe(true)
  })

  it('h > 1,5b usa b′ = 1,2b', () => {
    // 20×60: b′ = 240 → Rb = 21,6 (vs 2Ac/(b+h) = 300 → 27)
    const r = checkColumnFire({ b: 200, h: 600, c1: 40, lefFi: 2, muFi: 0.7, nBars: 4 }, 60)
    // Σ = 24,9+16+28,8+21,6+0 = 91,3 → TRF = 120·(91,3/120)^1,8 = 73,3
    expect(relErr(r.trf, 73.3)).toBeLessThan(5e-3)
  })

  it('carga alta (μfi→1) derruba o TRF', () => {
    const r = checkColumnFire({ b: 250, h: 250, c1: 40, lefFi: 2.5, muFi: 1, nBars: 4 }, 60)
    expect(r.trf).toBeLessThan(60)
    expect(r.ok).toBe(false)
  })
})
