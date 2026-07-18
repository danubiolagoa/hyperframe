import { describe, expect, it } from 'vitest'
import { designPileCap } from '../src/nbr/nbr6118/pileCaps'

function relErr(actual: number, expected: number): number {
  return Math.abs(actual / expected - 1)
}

// ---------------------------------------------------------------------------
// Blocos sobre estacas — método das bielas (Blévot)
// Pilar 25×60 (ap,eq = √0,15 = 0,3873 m) · estaca φ40 · e = 3φ = 1,20 m · C25
// ---------------------------------------------------------------------------

const BASE = {
  ap: 0.6,
  bp: 0.25,
  pileCapacity: 300,
  pileDiameter: 0.4,
  spacingFactor: 3,
  fcd: 17_857.1,
  fyd: 434_782.6,
}

describe('designPileCap (Blévot)', () => {
  it('2 estacas — âncora: N=500 kN → d=0,64 · α=51,8° · As=7,28 cm²', () => {
    const r = designPileCap({ nServ: 500, ...BASE })
    expect(r.nPiles).toBe(2)
    expect(relErr(r.e, 1.2)).toBeLessThan(1e-9)
    // dTarget = 0,6·(1,2 − 0,3873/2) = 0,6038 → h = 0,70 → d = 0,64
    expect(r.h).toBeCloseTo(0.7, 9)
    expect(r.d).toBeCloseTo(0.64, 9)
    // tgα = 0,64/(0,6 − 0,0968) = 1,2719 → α = 51,8°
    expect(relErr(r.alphaDeg, 51.82)).toBeLessThan(2e-3)
    // As = 1,15·700·(2,4−0,3873)/(8·0,64·fyd) = 7,28 cm²
    expect(relErr(r.asMain, 7.28e-4)).toBeLessThan(0.01)
    expect(r.mainSpec).toBe('6 φ 12.5') // menor bitola com n ≤ 8 barras
    // bielas: σpil = 700/(0,15·sen²α) = 7553 · σest = 700/(2·0,1257·sen²α) = 4508
    expect(relErr(r.sigmaPil, 7553)).toBeLessThan(0.01)
    expect(relErr(r.sigmaEst, 4508)).toBeLessThan(0.01)
    // limite 2 estacas: 1,4·0,9·fcd = 22 500 kPa
    expect(relErr(r.sigmaLim, 22_500)).toBeLessThan(1e-3)
    expect(r.status).toBe('ok')
  })

  it('carga por estaca inclui 5% de peso do bloco e respeita a capacidade', () => {
    const r = designPileCap({ nServ: 500, ...BASE })
    expect(relErr(r.pileLoad, 262.5)).toBeLessThan(1e-9)
    expect(r.pileLoad).toBeLessThanOrEqual(r.pileCapacity)
  })

  it('4 estacas — N=1000 kN: As por lado = N(2e−ap)/(16d)/fyd', () => {
    const r = designPileCap({ nServ: 1000, ...BASE })
    expect(r.nPiles).toBe(4)
    // dTarget = 0,85·1,0064 = 0,8554 → h = 0,95 → d = 0,89
    expect(r.d).toBeCloseTo(0.89, 9)
    // As,lado = 1400·(2,4−0,3873)/(16·0,89·434783) = 4,55 cm²
    expect(relErr(r.asMain, 4.551e-4)).toBeLessThan(0.01)
    // limite 4 estacas: 2,1·0,9·fcd = 33 750 kPa
    expect(relErr(r.sigmaLim, 33_750)).toBeLessThan(1e-3)
    expect(r.planA).toBeCloseTo(r.planB, 9)
    expect(r.status).toBe('ok')
  })

  it('3 estacas — tirante pelos lados: Rs,med/√3', () => {
    const r = designPileCap({ nServ: 750, ...BASE })
    expect(r.nPiles).toBe(3)
    // limite 3 estacas: 1,75·0,9·fcd
    expect(relErr(r.sigmaLim, 1.75 * 0.9 * 17_857.1)).toBeLessThan(1e-6)
    expect(r.notes.some((n) => n.includes('suspensão'))).toBe(true)
  })

  it('1 estaca: sem tirante (bloco de coroamento)', () => {
    const r = designPileCap({ nServ: 200, ...BASE })
    expect(r.nPiles).toBe(1)
    expect(r.asMain).toBe(0)
    expect(r.mainSpec).toBe('malha mínima')
  })

  it('carga que pedia 7 estacas agora vira bloco CEB (sem clamp em 5)', () => {
    const r = designPileCap({ nServ: 2000, ...BASE, pileCapacity: 300 })
    // 2100/300 = 7 estacas — malha 2×4 pelo método CEB, carga/estaca no limite
    expect(r.nPiles).toBe(7)
    expect(r.pileLoad).toBeLessThanOrEqual(300 + 1e-6)
    expect(r.notes.some((n) => n.includes('CEB-70'))).toBe(true)
  })

  it('estaca sobrecarregada (nº fixado) → falha', () => {
    const r = designPileCap({ nServ: 2000, ...BASE, pileCapacity: 300, nPilesFixed: 4 })
    expect(r.pileLoad).toBeGreaterThan(300)
    expect(r.status).toBe('falha')
  })

  it('α mantido em 45–55° pela escolha de d', () => {
    for (const nServ of [400, 600, 900, 1100]) {
      const r = designPileCap({ nServ, ...BASE })
      if (r.nPiles >= 2) {
        expect(r.alphaDeg).toBeGreaterThan(42)
        expect(r.alphaDeg).toBeLessThan(58)
      }
    }
  })
})
