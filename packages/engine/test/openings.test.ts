import { describe, expect, it } from 'vitest'
import { createSampleProject } from '../src/model/factory'
import { nextRegionName } from '../src/model/naming'
import {
  buildAnalysisModel,
  slabOpeningPolygons,
  slabOpeningsArea,
} from '../src/analysis/buildModel'
import { runSlabDesign } from '../src/design/slabRun'
import { polygonArea } from '../src/geometry/geometry'
import type { Project } from '../src/model/types'

/**
 * Furos/aberturas de laje: escada abre furo por padrão (stair.opening) e o
 * kind 'furo' remove peso próprio/revestimento/sobrecarga na interseção.
 * ESC1 do projeto exemplo: 1,4×2,8 m = 3,92 m² inteiramente sobre lajes do
 * tipo (h = 12 cm, revest. 1,5, sobrecarga 1,5 kN/m²).
 */

const ESC_AREA = 1.4 * 2.8

function sampleWithStairOpening(opening: boolean): Project {
  const p = createSampleProject()
  const tipo = p.plans[0]
  for (const r of tipo.loadRegions) {
    if (r.kind === 'escada') r.stair = { waist: 0.12, riser: 0.175, tread: 0.27, finish: 1.0, opening }
  }
  return p
}

describe('furos de laje (aberturas)', () => {
  it('nomeia furos como FUR1, FUR2…', () => {
    const p = createSampleProject()
    expect(nextRegionName(p, p.plans[0].id, 'furo')).toBe('FUR1')
  })

  it('escada abre furo por padrão: peso do pavimento cai (g e q)', () => {
    const withHole = buildAnalysisModel(sampleWithStairOpening(true)).model
    const noHole = buildAnalysisModel(sampleWithStairOpening(false)).model
    // um nível do tipo qualquer (o 1º pavimento é levelWeights[0])
    const gDiff = noHole.levelWeights[0].G - withHole.levelWeights[0].G
    const qDiff = noHole.levelWeights[0].Q - withHole.levelWeights[0].Q
    // Δg = (0,12·25 + 1,5)·3,92 = 17,64 kN · Δq = 1,5·3,92 = 5,88 kN
    expect(gDiff).toBeCloseTo((0.12 * 25 + 1.5) * ESC_AREA, 3)
    expect(qDiff).toBeCloseTo(1.5 * ESC_AREA, 3)
  })

  it('região kind furo desconta carga da laje da cobertura', () => {
    const base = createSampleProject()
    const withFuro = createSampleProject()
    const cob = withFuro.plans[1]
    cob.loadRegions.push({
      id: 'furo-test',
      name: 'FUR1',
      kind: 'furo',
      polygon: [
        { x: 1.0, y: 1.0 },
        { x: 3.0, y: 1.0 },
        { x: 3.0, y: 2.0 },
        { x: 1.0, y: 2.0 },
      ],
      g: 0,
      q: 0,
    })
    const a = buildAnalysisModel(base).model
    const b = buildAnalysisModel(withFuro).model
    const top = a.levelWeights.length - 1
    // cobertura: h = 12 cm, revest. 1,0, q = 1,0 → Δg = (3+1)·2 = 8 · Δq = 1·2 = 2
    expect(a.levelWeights[top].G - b.levelWeights[top].G).toBeCloseTo(8, 3)
    expect(a.levelWeights[top].Q - b.levelWeights[top].Q).toBeCloseTo(2, 3)
  })

  it('slabOpeningsArea/Polygons recortam pelo contorno da laje', () => {
    const p = sampleWithStairOpening(true)
    const tipo = p.plans[0]
    // laje que contém a escada (célula 4,0–8,5 × 4,5–9,0)
    const slab = tipo.slabs.find(
      (s) => polygonArea(s.polygon) > 1 && slabOpeningsArea(tipo, s) > 1e-6,
    )!
    expect(slab).toBeDefined()
    expect(slabOpeningsArea(tipo, slab)).toBeCloseTo(ESC_AREA, 3)
    const polys = slabOpeningPolygons(tipo, slab)
    expect(polys).toHaveLength(1)
    expect(polygonArea(polys[0])).toBeCloseTo(ESC_AREA, 3)
  })

  it('stair.opening = false não fura; demais regiões não furam', () => {
    const p = sampleWithStairOpening(false)
    const tipo = p.plans[0]
    for (const s of tipo.slabs) expect(slabOpeningsArea(tipo, s)).toBe(0)
    // reservatório (cobertura) não fura
    const cob = p.plans[1]
    for (const s of cob.slabs) expect(slabOpeningsArea(cob, s)).toBe(0)
  })

  it('dimensionamento da laje anota o furo (e alerta se grande)', () => {
    const p = sampleWithStairOpening(true)
    const design = runSlabDesign(p)
    const withNote = design.filter((d) => d.notes.some((n) => n.includes('Furo')))
    expect(withNote.length).toBeGreaterThan(0)
    // ESC 3,92 m² sobre laje 4,5×4,5 = 19,3% > 15% → atenção
    expect(withNote[0].status).toBe('atencao')
  })
})
