import { describe, expect, it } from 'vitest'
import { tSectionInertia } from '../src/analysis/flange'
import { analyze } from '../src/analyze'
import { createSampleProject } from '../src/model/factory'

// ---------------------------------------------------------------------------
// Refinamentos de análise (v0.2.25): inércia T no pórtico, redistribuição
// §14.6.4.3 e excentricidade de vento (testada no integration.test).
// ---------------------------------------------------------------------------

describe('tSectionInertia (rigidez §14.6.2.2)', () => {
  it('âncora manual: 20×60 c/ mesa 92×10 ⇒ I_T = 0,006473 m⁴ (1,80× retangular)', () => {
    // yc = 0,20625 m do topo; I = 0,0046547 (alma) + 0,0018178 (abas)
    const iT = tSectionInertia(0.2, 0.6, 0.92, 0.1)
    expect(iT).toBeCloseTo(0.0064725, 5)
    expect(iT / ((0.2 * 0.6 ** 3) / 12)).toBeCloseTo(1.798, 2)
  })

  it('sem aba (bf = bw) degenera p/ retangular', () => {
    expect(tSectionInertia(0.2, 0.6, 0.2, 0.1)).toBeCloseTo(0.0036, 6)
  })
})

describe('inércia T aplicada ao pórtico', () => {
  it('projeto exemplo: vigas com laje ganham props com Iz > retangular + aviso', () => {
    const results = analyze(createSampleProject())
    const withT = results.model.members.filter(
      (m) => m.ref.kind === 'beam' && m.props && m.props.Iz > (m.section.bw * m.section.h ** 3) / 12 + 1e-9,
    )
    expect(withT.length).toBeGreaterThan(0)
    for (const m of withT) {
      // área p/ peso próprio segue retangular (laje já pesa por conta própria)
      expect(m.props!.A).toBeCloseTo(m.section.bw * m.section.h, 9)
    }
    expect(results.model.warnings.some((w) => w.includes('mesa colaborante'))).toBe(true)
  })
})

describe('redistribuição de momentos §14.6.4.3', () => {
  const base = analyze(createSampleProject())
  const red = (() => {
    const p = createSampleProject()
    p.settings.momentRedistribution = 0.85
    return analyze(p)
  })()

  it('δ = 0,85 reduz os negativos e devolve o alívio ao vão', () => {
    const b0 = base.beamDesign.reduce((best, b) =>
      (b.negLeft?.md ?? 0) > (best.negLeft?.md ?? 0) ? b : best,
    )
    expect(b0.negLeft!.md).toBeGreaterThan(5)
    // ids são uid novos a cada createSampleProject() — casa por nome + vão
    const b1 = red.beamDesign.find(
      (b) => b.beamName === b0.beamName && b.spanIndex === b0.spanIndex,
    )!
    expect(b1.negLeft!.md).toBeCloseTo(0.85 * b0.negLeft!.md, 1)
    expect(b1.positive.md).toBeGreaterThan(b0.positive.md)
    expect(b1.negLeft!.note ?? '').toContain('14.6.4.3')
  })

  it('sem o ajuste, nada muda (δ ausente = 1)', () => {
    const b = base.beamDesign.find((x) => x.negLeft)!
    expect(b.negLeft!.note ?? '').not.toContain('redistribuição')
  })
})
