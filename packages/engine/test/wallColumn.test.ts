import { describe, expect, it } from 'vitest'
import { designWallColumn } from '../src/nbr/nbr6118/wallColumn'
import { analyze } from '../src/analyze'
import { createSampleProject } from '../src/model/factory'

// ---------------------------------------------------------------------------
// Pilar-parede §15.9: parede 150×25, pé-direito 2,80 m, C25/CA-50.
// Lâminas: 3·h = 75 cm ⇒ 2 lâminas de 75. A = 0,375 m² · I = 0,0703125 m⁴.
// N = 3000, M_forte = 900: σ = 8000 ± 900·0,375/I = 8000 ± 4800 kPa
//   ⇒ N₁ = 12800·0,1875 = 2400 kN · N₂ = 3200·0,1875 = 600 kN (Σ = 3000 ✓)
// λ = 3,46·2,80/0,25 = 38,8 > 35 ⇒ 2ª ordem local ativa na espessura.
// ---------------------------------------------------------------------------

const BASE = {
  length: 1.5,
  thickness: 0.25,
  le: 2.8,
  cover: 0.03,
  fcd: 17_857.1,
  fyd: 434_782.6,
  es: 210_000_000,
}

describe('designWallColumn (§15.9 + §18.5)', () => {
  it('âncora: 2 lâminas de 75; N repartido 2400/600 pela flexão forte; λ = 38,8', () => {
    const r = designWallColumn({ ...BASE, nd: 3000, mStrong: 900, mWeak: 0 })
    expect(r.laminas).toHaveLength(2)
    expect(r.laminas[0].width).toBeCloseTo(0.75, 6)
    // lâmina 1 em s = −0,375 (σ menor) e lâmina 2 em s = +0,375
    const nSorted = r.laminas.map((l) => l.nd).sort((a, b) => a - b)
    expect(nSorted[0]).toBeCloseTo(600, 0)
    expect(nSorted[1]).toBeCloseTo(2400, 0)
    expect(r.lambdaMax).toBeCloseTo(38.8, 0)
    expect(r.tensionEdge).toBe(false)
    expect(r.ok).toBe(true)
    expect(r.notes.join(' ')).toMatch(/15\.9/)
  })

  it('2ª ordem local: momento da lâmina supera o mínimo (λ > 35)', () => {
    const r = designWallColumn({ ...BASE, nd: 3000, mStrong: 0, mWeak: 0 })
    const l0 = r.laminas[0]
    const mMin = l0.nd * (0.015 + 0.03 * 0.25) // §11.3.3.4.3
    expect(l0.md).toBeGreaterThan(mMin * 1.02)
  })

  it('borda TRACIONADA: momento alto vira tirante As = |N|/fyd', () => {
    // σ = 2667 ∓ 10667 ⇒ lâmina de borda com N = −1500 kN
    const r = designWallColumn({ ...BASE, nd: 1000, mStrong: 2000, mWeak: 0 })
    expect(r.tensionEdge).toBe(true)
    const tens = r.laminas.find((l) => l.tension)!
    expect(tens.nd).toBeCloseTo(-1500, 0)
    expect(tens.as).toBeCloseTo(1500 / 434_782.6, 4)
    expect(r.notes.join(' ')).toMatch(/tracionada/i)
  })

  it('mínimos §18.5: horizontal ≥ máx(25% da vertical; 0,15%·Ac) e specs por face', () => {
    const r = designWallColumn({ ...BASE, nd: 3000, mStrong: 900, mWeak: 0 })
    expect(r.asHPerM).toBeGreaterThanOrEqual(0.0015 * 0.25 - 1e-9)
    expect(r.asHPerM).toBeGreaterThanOrEqual(0.25 * (r.asTotal / 1.5) - 1e-9)
    expect(r.vSpec).toMatch(/por face/)
    expect(r.hSpec).toMatch(/por face/)
  })

  it('parede longa: 3 m / 20 cm ⇒ 5 lâminas de 60 cm', () => {
    const r = designWallColumn({
      ...BASE,
      length: 3,
      thickness: 0.2,
      nd: 4000,
      mStrong: 0,
      mWeak: 0,
    })
    expect(r.laminas).toHaveLength(5)
    expect(r.laminas[0].width).toBeCloseTo(0.6, 6)
  })
})

describe('integração: pilar 25×150 vira pilar-parede no runColumnDesign', () => {
  it('analyze() marca wall (2 lâminas, specs §18.5) e As ≥ Σ lâminas', () => {
    const project = createSampleProject()
    project.columns[0].section = { bw: 0.25, h: 1.5 }
    const results = analyze(project)
    const r = results.columnDesign.find((c) => c.columnId === project.columns[0].id)!
    expect(r.wall).toBeDefined()
    expect(r.wall!.laminas).toBe(2)
    expect(r.wall!.thickness).toBeCloseTo(0.25, 6)
    expect(r.wall!.length).toBeCloseTo(1.5, 6)
    expect(r.as).toBeGreaterThanOrEqual(r.wall!.asTotal - 1e-9)
    expect(r.notes.join(' ')).toMatch(/15\.9/)
    // pilares normais não ganham wall
    const normal = results.columnDesign.find((c) => c.columnId !== project.columns[0].id)!
    expect(normal.wall).toBeUndefined()
  })
})
