import { describe, expect, it } from 'vitest'
import { effectiveFlange, designTBeamFlexure } from '../src/nbr/nbr6118/tSection'
import { designBeamFlexure } from '../src/nbr/nbr6118/beamDesign'
import { analyze } from '../src/analyze'
import { createSampleProject } from '../src/model/factory'

// ---------------------------------------------------------------------------
// Mesa colaborante §14.6.2.2 + flexão de seção T (§17) — âncoras à mão, C25/CA-50
// ---------------------------------------------------------------------------

const MAT = { fcd: 17_857.1, fyd: 434_782.6, fck: 25_000 }

describe('effectiveFlange (§14.6.2.2)', () => {
  it('âncora: bw 20, vão 6 m contínuo nos 2 extremos, laje livre 2 m por lado', () => {
    // a = 0,6·6 = 3,6 → 0,10·a = 0,36 governa sobre 0,5·b2 = 1,0
    const r = effectiveFlange({
      bw: 0.2,
      spanLength: 6,
      continuousEnds: 2,
      clearLeft: 2,
      clearRight: 2,
    })
    expect(r.a).toBeCloseTo(3.6, 6)
    expect(r.b1Left).toBeCloseTo(0.36, 6)
    expect(r.bf).toBeCloseTo(0.92, 6)
  })

  it('vão isolado: a = l; laje estreita: 0,5·b2 governa; lado sem laje = 0', () => {
    const r = effectiveFlange({
      bw: 0.2,
      spanLength: 4,
      continuousEnds: 0,
      clearLeft: 0.5,
      clearRight: null,
    })
    expect(r.a).toBeCloseTo(4, 6)
    expect(r.b1Left).toBeCloseTo(0.25, 6) // 0,5·0,5 < 0,10·4
    expect(r.b1Right).toBe(0)
    expect(r.bf).toBeCloseTo(0.45, 6)
  })
})

describe('designTBeamFlexure', () => {
  it('LN na mesa: Md=200, bf=92, hf=10, d=54 → x=3,4 cm, As=8,74 cm²', () => {
    const r = designTBeamFlexure({ md: 200, bw: 0.2, bf: 0.92, hf: 0.1, h: 0.6, d: 0.54, ...MAT })
    expect(r.flangeOnly).toBe(true)
    expect(r.xd).toBeCloseTo(0.034 / 0.54, 2)
    expect(r.as).toBeCloseTo(8.74e-4, 3)
    expect(r.ok).toBe(true)
  })

  it('ECONOMIA: mesmo Md em retangular bw=20 pede 9,79 cm² (T poupa ~11%)', () => {
    const rect = designBeamFlexure({ md: 200, bw: 0.2, h: 0.6, d: 0.54, ...MAT })
    expect(rect.as).toBeCloseTo(9.79e-4, 3)
    const t = designTBeamFlexure({ md: 200, bw: 0.2, bf: 0.92, hf: 0.1, h: 0.6, d: 0.54, ...MAT })
    expect(t.as).toBeLessThan(0.92 * rect.as)
  })

  it('LN na alma: Md=420, bf=50, hf=8 → Mf=182,1 · x=21,6 cm · As=20,4 cm²', () => {
    const r = designTBeamFlexure({ md: 420, bw: 0.2, bf: 0.5, hf: 0.08, h: 0.6, d: 0.54, ...MAT })
    expect(r.flangeOnly).toBe(false)
    expect(r.xd).toBeCloseTo(0.4, 1)
    expect(r.as).toBeCloseTo(20.44e-4, 3)
    expect(r.ok).toBe(true)
  })

  it('sobrecarga: alma não resiste ⇒ ok=false com nota', () => {
    const r = designTBeamFlexure({ md: 900, bw: 0.2, bf: 0.5, hf: 0.08, h: 0.6, d: 0.54, ...MAT })
    expect(r.ok).toBe(false)
    expect(r.note).toMatch(/insuficiente|x\/d/)
  })
})

describe('integração: vigas do projeto exemplo ganham mesa no positivo', () => {
  it('analyze() marca flange (bf > bw) e nota §14.6.2.2 em vigas com laje', () => {
    const results = analyze(createSampleProject())
    const withFlange = results.beamDesign.filter((b) => b.positive.flange)
    expect(withFlange.length).toBeGreaterThan(0)
    for (const b of withFlange) {
      expect(b.positive.flange!.bf).toBeGreaterThan(b.section.bw + 0.019)
      expect(b.positive.flange!.hf).toBeLessThan(b.section.h)
    }
    expect(withFlange.some((b) => (b.positive.note ?? '').includes('14.6.2.2'))).toBe(true)
    // negativos continuam retangulares (mesa tracionada)
    expect(withFlange.every((b) => !b.negLeft || !('flange' in b.negLeft) || !b.negLeft.flange)).toBe(
      true,
    )
  })
})
