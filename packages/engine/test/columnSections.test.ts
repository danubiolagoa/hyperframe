import { describe, expect, it } from 'vitest'
import {
  columnFootprint,
  columnHalfExtents,
  columnSectionInfo,
  columnWorldDirs,
  insetRectilinear,
  polygonSectionProps,
} from '../src/model/columnSection'
import {
  designColumnSection,
  interactionCurve,
  placeBars,
  squashLoad,
  type ColumnSectionDef,
} from '../src/nbr/nbr6118/columnDesign'
import { buildAnalysisModel } from '../src/analysis/buildModel'
import { createEmptyProject } from '../src/model/factory'
import { uid } from '../src/model/uid'

// ---------------------------------------------------------------------------
// propriedades geométricas (âncoras manuais)
// ---------------------------------------------------------------------------

describe('columnSectionInfo — círculo', () => {
  const info = columnSectionInfo({ shape: 'circle', d: 0.4 })
  it('área, inércia e torção exatas (πd²/4, πd⁴/64, πd⁴/32)', () => {
    expect(info.A).toBeCloseTo((Math.PI * 0.4 ** 2) / 4, 10)
    expect(info.Iu).toBeCloseTo((Math.PI * 0.4 ** 4) / 64, 10)
    expect(info.Iv).toBeCloseTo(info.Iu, 12)
    expect(info.J).toBeCloseTo((Math.PI * 0.4 ** 4) / 32, 10)
    expect(info.perimeter).toBeCloseTo(Math.PI * 0.4, 10)
  })
  it('caixa envolvente d×d, rótulo ø40', () => {
    expect(info.bu).toBeCloseTo(0.4, 10)
    expect(info.bv).toBeCloseTo(0.4, 10)
    expect(info.minDim).toBeCloseTo(0.4, 10)
    expect(info.label).toBe('ø40')
  })
  it('polígono de 48 lados levemente conservador em área', () => {
    const p = polygonSectionProps(info.polygon)
    expect(p.A).toBeLessThan(info.A)
    expect(p.A).toBeGreaterThan(0.995 * info.A)
  })
})

describe('columnSectionInfo — L 50x50 t20/20 (âncora composta)', () => {
  const info = columnSectionInfo({ shape: 'L', b: 0.5, h: 0.5, tb: 0.2, th: 0.2 })
  // A = 0,5·0,2 + 0,2·0,3 = 0,16 m²; centróide a 0,19375 do canto;
  // I = 2,3997e-3 + 7,2734e-4 = 3,1271e-3 m⁴ (cada direção, por simetria)
  it('área e inércias compostas', () => {
    expect(info.A).toBeCloseTo(0.16, 9)
    expect(info.Iu).toBeCloseTo(3.1271e-3, 6)
    expect(info.Iv).toBeCloseTo(info.Iu, 9)
  })
  it('J de paredes finas (Σℓt³/3) e menor espessura', () => {
    expect(info.J).toBeCloseTo((0.5 * 0.2 ** 3 + 0.3 * 0.2 ** 3) / 3, 9)
    expect(info.minDim).toBeCloseTo(0.2, 9)
    expect(info.label).toBe('L 50x50 t20/20')
  })
  it('polígono centrado no centróide (momento estático nulo)', () => {
    const p = polygonSectionProps(info.polygon)
    expect(p.cx).toBeCloseTo(0, 6)
    expect(p.cy).toBeCloseTo(0, 6)
  })
})

describe('insetRectilinear', () => {
  it('retângulo 25×60 recuado 3 cm → 19×54', () => {
    const rect = columnSectionInfo({ bw: 0.25, h: 0.6 }).polygon
    const ins = insetRectilinear(rect, 0.03)
    const xs = ins.map((p) => p.x)
    const ys = ins.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.19, 9)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.54, 9)
  })
  it('L recuado mantém 6 vértices e área menor', () => {
    const info = columnSectionInfo({ shape: 'L', b: 0.5, h: 0.5, tb: 0.2, th: 0.2 })
    const ins = insetRectilinear(info.polygon, 0.03)
    expect(ins).toHaveLength(6)
    expect(polygonSectionProps(ins).A).toBeLessThan(info.A)
  })
})

describe('orientação em planta (rotação 0/90/180/270)', () => {
  it('vDir acompanha a rotação e uDir é perpendicular', () => {
    expect(columnWorldDirs(0).vDir).toEqual({ x: 1, y: 0 })
    expect(columnWorldDirs(90).vDir).toEqual({ x: 0, y: 1 })
    expect(columnWorldDirs(180).vDir).toEqual({ x: -1, y: 0 })
    expect(columnWorldDirs(270).vDir).toEqual({ x: 0, y: -1 })
  })
  it('retângulo rot 0: h ao longo de X (compatibilidade histórica)', () => {
    const col = {
      section: { bw: 0.25, h: 0.6 } as const,
      rotationDeg: 0 as const,
      pos: { x: 10, y: 5 },
    }
    const { dx, dy } = columnHalfExtents(col)
    expect(dx).toBeCloseTo(0.3, 9)
    expect(dy).toBeCloseTo(0.125, 9)
    const fp = columnFootprint(col)
    const xs = fp.map((p) => p.x)
    expect(Math.max(...xs)).toBeCloseTo(10.3, 9)
    expect(Math.min(...xs)).toBeCloseTo(9.7, 9)
  })
  it('L rot 90 troca a caixa envolvente', () => {
    const secL = { shape: 'L', b: 0.6, h: 0.4, tb: 0.15, th: 0.2 } as const
    const e0 = columnHalfExtents({ section: secL, rotationDeg: 0 })
    const e90 = columnHalfExtents({ section: secL, rotationDeg: 90 })
    expect(e0.dx).toBeCloseTo(e90.dy, 9)
    expect(e0.dy).toBeCloseTo(e90.dx, 9)
  })
})

// ---------------------------------------------------------------------------
// dimensionamento — seções circulares e em L
// ---------------------------------------------------------------------------

function circleDef(d: number): ColumnSectionDef {
  const info = columnSectionInfo({ shape: 'circle', d })
  return {
    bw: info.bu,
    h: info.bv,
    cover: 0.03,
    fcd: 30000 / 1.4,
    fyd: 500000 / 1.15,
    es: 210e6,
    shape: 'circle',
    polygon: info.polygon,
    ac: info.A,
    minDim: info.minDim,
  }
}

function lDef(): ColumnSectionDef {
  const info = columnSectionInfo({ shape: 'L', b: 0.5, h: 0.5, tb: 0.2, th: 0.2 })
  return {
    bw: info.bu,
    h: info.bv,
    cover: 0.03,
    fcd: 30000 / 1.4,
    fyd: 500000 / 1.15,
    es: 210e6,
    shape: 'L',
    polygon: info.polygon,
    ac: info.A,
    minDim: info.minDim,
  }
}

describe('placeBars — círculo e L', () => {
  it('anel de 8 barras no círculo ø40 (raio correto)', () => {
    const sec = circleDef(0.4)
    const pos = placeBars(sec, 8, 0.016)!
    expect(pos).toHaveLength(8)
    const rb = 0.2 - 0.03 - 0.0063 - 0.008
    for (const p of pos) expect(Math.hypot(p.x, p.y)).toBeCloseTo(rb, 6)
  })
  it('círculo: mínimo 6 barras (§18.4.2.1)', () => {
    expect(placeBars(circleDef(0.4), 4, 0.016)).toBeNull()
  })
  it('L: 6 barras nos vértices do contorno recuado', () => {
    const sec = lDef()
    const pos = placeBars(sec, 6, 0.016)
    expect(pos).not.toBeNull()
    expect(pos!).toHaveLength(6)
    // todas dentro da caixa envolvente
    for (const p of pos!) {
      expect(Math.abs(p.x)).toBeLessThan(0.5)
      expect(Math.abs(p.y)).toBeLessThan(0.5)
    }
  })
})

describe('capacidade — círculo', () => {
  it('esmagamento centrado: 0,85·fcd·(Ac−As) + σs·As', () => {
    const sec = circleDef(0.4)
    const bars = {
      n: 8,
      phi: 0.016,
      positions: placeBars(sec, 8, 0.016)!,
      as: (8 * Math.PI * 0.016 ** 2) / 4,
      spec: '8 φ 16',
    }
    const sigmaS = Math.min(sec.fyd, sec.es * 0.002)
    const expected = 0.85 * sec.fcd * (sec.ac! - bars.as) + sigmaS * bars.as
    expect(squashLoad(sec, bars)).toBeCloseTo(expected, 6)
  })
  it('curva de interação ~radialmente simétrica', () => {
    const sec = circleDef(0.4)
    const bars = {
      n: 8,
      phi: 0.02,
      positions: placeBars(sec, 8, 0.02)!,
      as: (8 * Math.PI * 0.02 ** 2) / 4,
      spec: '8 φ 20',
    }
    const nd = 1500
    const curve = interactionCurve(sec, bars, nd, 16)!
    const radii = curve.map((p) => Math.hypot(p.x, p.y))
    const rMax = Math.max(...radii)
    const rMin = Math.min(...radii)
    expect(rMin).toBeGreaterThan(0.85 * rMax) // 48-gon + 8 barras: quase isotrópico
  })
})

describe('designColumnSection — círculo e L resolvem solicitações reais', () => {
  it('círculo ø50 suporta Nd=2000 kN com M=120 kN·m', () => {
    const sec = circleDef(0.5)
    const out = designColumnSection(
      sec,
      [{ label: 'ELU1', nd: 2000, mu: 120, mv: 60 }],
      Math.max((0.15 * 2000) / sec.fyd, 0.004 * sec.ac!),
    )
    expect(out.ok).toBe(true)
    expect(out.utilization).toBeLessThanOrEqual(1.001)
    expect(out.arrangement!.n).toBeGreaterThanOrEqual(6)
  })
  it('L 50x50 t20/20 suporta flexo-compressão oblíqua', () => {
    const sec = lDef()
    const out = designColumnSection(
      sec,
      [{ label: 'ELU1', nd: 1200, mu: 80, mv: 80 }],
      Math.max((0.15 * 1200) / sec.fyd, 0.004 * sec.ac!),
    )
    expect(out.ok).toBe(true)
    expect(out.arrangement!.n).toBeGreaterThanOrEqual(6)
  })
})

// ---------------------------------------------------------------------------
// modelo de análise — eixos locais e propriedades por forma
// ---------------------------------------------------------------------------

describe('buildAnalysisModel — pilares não retangulares', () => {
  function oneColumnProject(section: Parameters<typeof columnSectionInfo>[0], rot: 0 | 90 | 180 | 270) {
    const p = createEmptyProject({
      name: 'T',
      fck: 30000,
      aggregate: 'granito',
      caa: 'II',
      numFloors: 1,
      floorHeight: 3,
      wind: { enabled: false, v0: 40, s1: 1, category: 4, s3Group: 2 },
      createdAt: '2026-01-01',
    })
    p.columns = [
      {
        id: uid('col'),
        name: 'P1',
        pos: { x: 0, y: 0 },
        section,
        rotationDeg: rot,
        baseLevelId: p.levels[0].id,
        topLevelId: p.levels[1].id,
      },
    ]
    return p
  }

  it('rot 180 espelha o eixo local y (yL = [−1,0,0])', () => {
    const { model } = buildAnalysisModel(oneColumnProject({ bw: 0.25, h: 0.6 }, 180))
    const m = model.members[0]
    expect(m.yLocal[0]).toBeCloseTo(-1, 12)
    expect(m.yLocal[1]).toBeCloseTo(0, 12)
    expect(m.zLocal[0]).toBeCloseTo(0, 12)
    expect(m.zLocal[1]).toBeCloseTo(-1, 12)
  })

  it('círculo carrega props reais (A, I, J) e bbox d×d', () => {
    const { model } = buildAnalysisModel(oneColumnProject({ shape: 'circle', d: 0.4 }, 0))
    const m = model.members[0]
    expect(m.section.bw).toBeCloseTo(0.4, 9)
    expect(m.props!.A).toBeCloseTo((Math.PI * 0.16) / 4, 9)
    expect(m.props!.Iy).toBeCloseTo((Math.PI * 0.4 ** 4) / 64, 12)
    expect(m.props!.perimeter).toBeCloseTo(Math.PI * 0.4, 9)
  })
})
