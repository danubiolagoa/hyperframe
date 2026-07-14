import { describe, expect, it } from 'vitest'
import { checkBeamOpening } from '../src/nbr/nbr6118/beamOpenings'
import { runOpeningChecks } from '../src/design/openingsRun'
import { createSampleProject } from '../src/model/factory'
import { analyze } from '../src/analyze'
import { uid } from '../src/model/uid'

describe('checkBeamOpening — NBR 6118 §13.2.5', () => {
  const base = { h: 0.5, cover: 0.03 }

  it('furo pequeno, centrado e longe do apoio → dispensada', () => {
    const r = checkBeamOpening({
      ...base,
      opening: { width: 0.1, height: 0.1, yOffset: 0 },
      distToSupport: 1.5,
      clearToNext: null,
    })
    expect(r.status).toBe('dispensada')
    expect(r.exempt).toBe(true)
    expect(r.conditions.every((c) => c.ok)).toBe(true)
  })

  it('dimensão > 12 cm → verificar (condição b viola)', () => {
    const r = checkBeamOpening({
      ...base,
      opening: { width: 0.15, height: 0.1, yOffset: 0 },
      distToSupport: 1.5,
      clearToNext: null,
    })
    expect(r.status).toBe('verificar')
    expect(r.conditions.find((c) => c.id === 'dimensao')!.ok).toBe(false)
  })

  it('dimensão > h/3 governa em vigas baixas', () => {
    const r = checkBeamOpening({
      h: 0.3,
      cover: 0.03,
      opening: { width: 0.11, height: 0.08, yOffset: 0 },
      distToSupport: 1.5,
      clearToNext: null,
    })
    // limite = min(0,12; 0,30/3 = 0,10) → 11 cm reprova
    expect(r.conditions.find((c) => c.id === 'dimensao')!.ok).toBe(false)
  })

  it('perto do apoio (< 2h) → verificar', () => {
    const r = checkBeamOpening({
      ...base,
      opening: { width: 0.1, height: 0.1, yOffset: 0 },
      distToSupport: 0.6,
      clearToNext: null,
    })
    expect(r.status).toBe('verificar')
    expect(r.conditions.find((c) => c.id === 'apoio')!.ok).toBe(false)
  })

  it('encostado na face (viola §13.2.5.1) → inadequada', () => {
    const r = checkBeamOpening({
      ...base,
      opening: { width: 0.1, height: 0.3, yOffset: 0.08 },
      distToSupport: 1.5,
      clearToNext: null,
    })
    // borda = 0,25 − (0,08 + 0,15) = 0,02 < max(5 cm; 2·3 cm)
    expect(r.status).toBe('inadequada')
    expect(r.violated).toBe(true)
  })

  it('furos próximos (< 2h entre faces) → verificar', () => {
    const r = checkBeamOpening({
      ...base,
      opening: { width: 0.1, height: 0.1, yOffset: 0 },
      distToSupport: 1.5,
      clearToNext: 0.5,
    })
    expect(r.conditions.find((c) => c.id === 'vizinho')!.ok).toBe(false)
  })
})

describe('runOpeningChecks — projeto', () => {
  it('avalia furos por planta com distância a pilares', () => {
    const p = createSampleProject()
    const plan = p.plans[0]
    const beam = plan.beams[0] // eixo y=0, x de 0 a 12,5 com pilares em 0/4/8,5/12,5
    beam.openings = [
      { id: uid('op'), x: 2.0, width: 0.1, height: 0.1, yOffset: 0 }, // meio do 1º vão
      { id: uid('op'), x: 4.3, width: 0.1, height: 0.1, yOffset: 0 }, // perto do pilar em 4,0
    ]
    const checks = runOpeningChecks(p)
    expect(checks).toHaveLength(2)
    expect(checks[0].status).toBe('dispensada')
    expect(checks[1].status).toBe('verificar')
    expect(checks[0].levelNames.length).toBeGreaterThan(0)
  })

  it('entra nos resultados e gera aviso quando não dispensado', () => {
    const p = createSampleProject()
    p.plans[0].beams[0].openings = [
      { id: uid('op'), x: 0.3, width: 0.1, height: 0.1, yOffset: 0 },
    ]
    const r = analyze(p)
    expect(r.beamOpenings).toHaveLength(1)
    expect(r.beamOpenings[0].status).toBe('verificar')
    expect(r.warnings.some((w) => w.includes('Furo na viga'))).toBe(true)
  })
})
