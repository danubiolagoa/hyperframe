import { rhoMin } from './beamDesign'

/**
 * Mesa colaborante e flexão de seção T — NBR 6118 §14.6.2.2 e §17.
 *
 * Largura colaborante (Fig. 14.2): bf = bw + Σ b1, com, POR LADO com laje:
 *   b1 ≤ 0,5·b2 (b2 = distância LIVRE até a face da viga paralela vizinha)
 *   b1 ≤ 0,10·a (a = distância entre pontos de momento nulo):
 *     a = l (vão isolado) · 0,75·l (um extremo contínuo) · 0,60·l (dois)
 *
 * Flexão T (mesa comprimida — momento POSITIVO):
 *   1) tenta retangular com largura bf; se 0,8x ≤ hf, a LN está na mesa;
 *   2) senão decompõe: abas → Mf = 0,85·fcd·(bf−bw)·hf·(d−hf/2), e a alma
 *      resiste Mw = Md − Mf como retangular bw. As = Asf + Asw.
 * Momento negativo (mesa tracionada) segue retangular bw — fora daqui.
 */

export interface EffectiveFlangeInput {
  bw: number
  /** vão do trecho, m */
  spanLength: number
  /** nº de extremos contínuos do vão (0, 1, 2) */
  continuousEnds: 0 | 1 | 2
  /** distância livre até a viga paralela do lado esquerdo (null = sem laje) */
  clearLeft: number | null
  clearRight: number | null
}

export interface EffectiveFlangeResult {
  bf: number
  /** aba de cada lado, m */
  b1Left: number
  b1Right: number
  /** distância entre pontos de momento nulo, m */
  a: number
}

export function effectiveFlange(inp: EffectiveFlangeInput): EffectiveFlangeResult {
  const factor = inp.continuousEnds === 2 ? 0.6 : inp.continuousEnds === 1 ? 0.75 : 1
  const a = factor * inp.spanLength
  const side = (clear: number | null): number =>
    clear === null || clear <= 0 ? 0 : Math.min(0.5 * clear, 0.1 * a)
  const b1Left = side(inp.clearLeft)
  const b1Right = side(inp.clearRight)
  return { bf: inp.bw + b1Left + b1Right, b1Left, b1Right, a }
}

export interface TBeamFlexureInput {
  md: number // kN·m
  bw: number
  bf: number
  /** espessura da mesa (laje maciça: h; nervurada: capa), m */
  hf: number
  h: number
  d: number
  fcd: number // kPa
  fyd: number // kPa
  fck: number // kPa
}

export interface TBeamFlexureOutput {
  as: number
  asMin: number
  xd: number
  /** LN dentro da mesa (dimensionou como retangular bf) */
  flangeOnly: boolean
  ok: boolean
  note?: string
}

const XD_LIM = 0.45 // fck ≤ 50 MPa (§14.6.4.3)

/** retangular: retorna x da LN (m) ou null se Md não cabe */
function rectX(md: number, b: number, d: number, fcd: number): number | null {
  const c = 0.85 * fcd * b * 0.8
  const a = 0.4 * c
  const bb = -c * d
  const disc = bb * bb - 4 * a * md
  if (disc < 0) return null
  return (-bb - Math.sqrt(disc)) / (2 * a)
}

export function designTBeamFlexure(inp: TBeamFlexureInput): TBeamFlexureOutput {
  const { md, bw, bf, hf, h, d, fcd, fyd, fck } = inp
  const asMin = rhoMin(fck / 1000) * bw * h
  if (md < 0.1) {
    return { as: 0, asMin, xd: 0, flangeOnly: true, ok: true }
  }

  // 1) LN na mesa? — retangular com largura bf
  const xF = rectX(md, bf, d, fcd)
  if (xF !== null && 0.8 * xF <= hf + 1e-9) {
    const xd = xF / d
    const as = md / (fyd * (d - 0.4 * xF))
    return {
      as,
      asMin,
      xd,
      flangeOnly: true,
      ok: xd <= XD_LIM,
      note: xd > XD_LIM ? 'x/d acima do limite — aumente a seção' : undefined,
    }
  }

  // 2) LN na alma: abas + alma retangular bw
  const mf = 0.85 * fcd * (bf - bw) * hf * (d - hf / 2)
  const asf = mf / (fyd * (d - hf / 2))
  const mw = md - mf
  const xW = rectX(mw, bw, d, fcd)
  if (xW === null) {
    // alma não resiste nem com x = 0,45d — melhor esforço p/ reportar As
    const xLim = XD_LIM * d
    const asw = mw / (fyd * (d - 0.4 * xLim))
    return {
      as: asf + asw,
      asMin,
      xd: 1,
      flangeOnly: false,
      ok: false,
      note: 'seção T insuficiente — aumente a seção ou use armadura dupla',
    }
  }
  const xd = xW / d
  const asw = mw / (fyd * (d - 0.4 * xW))
  return {
    as: asf + asw,
    asMin,
    xd,
    flangeOnly: false,
    ok: xd <= XD_LIM,
    note: xd > XD_LIM ? 'x/d acima do limite — aumente a seção' : undefined,
  }
}
