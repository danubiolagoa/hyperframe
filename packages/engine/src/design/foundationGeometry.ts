import type { Column, Vec2 } from '../model/types'
import type { FoundationResultItem } from '../analysis/types'
import { pileLayout } from '../geotech/soil'

/**
 * Geometria em planta da fundação de um pilar (p/ editor 2D, 3D e planta de
 * fundações): retângulo orientado (sapata/bloco) e/ou círculos (estacas;
 * tubulão: fuste + base). Coordenadas GLOBAIS (centro = pilar + offset).
 */
export interface FoundationShape {
  center: Vec2
  /** contorno retangular em planta (4 vértices) — null p/ tubulão */
  polygon: Vec2[] | null
  /** círculos: estacas do bloco ou fuste/base do tubulão */
  circles: { c: Vec2; r: number }[]
  /** altura do sólido (h da sapata/bloco; tubulão: altura da base), m */
  h: number
  /** profundidade do TOPO abaixo do nível da fundação, m */
  depth: number
  /** rótulo de dimensões, ex.: "150×150" (cm) ou "ø90/180" */
  dims: string
}

const cmTxt = (m: number): string => String(Math.round(m * 100))

export function foundationShape(
  item: FoundationResultItem,
  column: Column,
  /** pilar parceiro (necessário p/ sapata associada) */
  partner?: Column,
): FoundationShape | null {
  // secundário de associada: a geometria vive no pilar dono
  if (item.combinedWithId) return null
  if (item.combined && partner) {
    const cf = item.combined
    const ux0 = partner.pos.x - column.pos.x
    const uy0 = partner.pos.y - column.pos.y
    const len = Math.hypot(ux0, uy0) || 1
    const ux = ux0 / len
    const uy = uy0 / len
    const cx = column.pos.x + ux * cf.xg + (item.offset?.x ?? 0)
    const cy = column.pos.y + uy * cf.xg + (item.offset?.y ?? 0)
    const ha = cf.a / 2
    const hb = cf.b / 2
    const corner = (sa: number, sb: number): Vec2 => ({
      x: cx + ux * sa * ha - uy * sb * hb,
      y: cy + uy * sa * ha + ux * sb * hb,
    })
    return {
      center: { x: cx, y: cy },
      polygon: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
      circles: [],
      h: cf.h,
      depth: item.depth ?? 0,
      dims: `${cmTxt(cf.a)}×${cmTxt(cf.b)} (${column.name}+${cf.partnerName})`,
    }
  }
  if (item.combined) return null
  const center: Vec2 = {
    x: column.pos.x + (item.offset?.x ?? 0),
    y: column.pos.y + (item.offset?.y ?? 0),
  }
  const depth = item.depth ?? 0
  // direção a = dimensão h do pilar (rot 0/180 → a ao longo de X)
  const alongX = column.rotationDeg === 0 || column.rotationDeg === 180
  const rect = (a: number, b: number): Vec2[] => {
    const hx = (alongX ? a : b) / 2
    const hy = (alongX ? b : a) / 2
    return [
      { x: center.x - hx, y: center.y - hy },
      { x: center.x + hx, y: center.y - hy },
      { x: center.x + hx, y: center.y + hy },
      { x: center.x - hx, y: center.y + hy },
    ]
  }

  if (item.kind === 'sapata' && item.footing) {
    const f = item.footing
    return {
      center,
      polygon: rect(f.a, f.b),
      circles: [],
      h: f.h,
      depth,
      dims: `${cmTxt(f.a)}×${cmTxt(f.b)}`,
    }
  }
  if (item.kind === 'bloco' && item.pileCap) {
    const pc = item.pileCap
    const circles = pileLayout(pc.nPiles, pc.e).map((p) => ({
      c: {
        x: center.x + (alongX ? p.a : p.b),
        y: center.y + (alongX ? p.b : p.a),
      },
      r: pc.pileDiameter / 2,
    }))
    return {
      center,
      polygon: rect(pc.planA, pc.planB),
      circles,
      h: pc.h,
      depth,
      dims: `${cmTxt(pc.planA)}×${cmTxt(pc.planB)} · ${pc.nPiles} est.`,
    }
  }
  if (item.kind === 'tubulao' && item.caisson) {
    const c = item.caisson
    return {
      center,
      polygon: null,
      circles: [
        { c: center, r: c.baseD / 2 },
        { c: center, r: c.shaftD / 2 },
      ],
      h: c.baseH,
      depth,
      dims: `ø${cmTxt(c.shaftD)}/${cmTxt(c.baseD)}`,
    }
  }
  return null
}
