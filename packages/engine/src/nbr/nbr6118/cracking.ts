/**
 * NBR 6118:2023 §17.3.3.2 — controle da fissuração: estimativa da abertura
 * característica wk sob a combinação FREQUENTE (ELS-W).
 *
 *   wk = min(w1, w2)
 *   w1 = (φ/(12,5·η1)) · (σs/Es) · (3·σs/fctm)
 *   w2 = (φ/(12,5·η1)) · (σs/Es) · (4/ρri + 45)
 *
 * σs — tensão na armadura tracionada no estádio II (seção fissurada, elástico);
 * ρri = As/Acri — taxa na área de envolvimento (aprox.: Acri = bw·hef,
 * hef = min(2,5·(h−d), (h−x)/3, h/2), como no EC2 — aproximação documentada).
 * η1 = 2,25 (barras nervuradas CA-50).
 *
 * Limites (tab. 13.4, concreto armado): CAA I → 0,4 mm · II/III → 0,3 mm ·
 * IV → 0,2 mm.
 */

import type { CAA } from '../../model/types'

export interface CrackWidthInput {
  /** momento fletor na combinação frequente, kN·m (>0) */
  ms: number
  bw: number
  h: number
  d: number
  /** área da armadura tracionada, m² */
  as: number
  /** diâmetro da barra, m */
  phi: number
  /** Es/Ecs */
  alphaE: number
  es: number // kPa
  fctm: number // kPa
}

export interface CrackWidthOutput {
  /** profundidade da LN no estádio II, m */
  x: number
  /** tensão na armadura, kPa */
  sigmaS: number
  /** taxa de armadura na área de envolvimento */
  rhoRi: number
  w1: number // m
  w2: number // m
  wk: number // m
}

const ETA1 = 2.25 // barras nervuradas

/** LN do estádio II (armadura simples): (bw/2)·x² + αe·As·x − αe·As·d = 0 */
export function stadium2NeutralAxis(bw: number, d: number, as: number, alphaE: number): number {
  const k = alphaE * as
  return (-k + Math.sqrt(k * k + 2 * bw * k * d)) / bw
}

export function crackWidth(inp: CrackWidthInput): CrackWidthOutput {
  const { ms, bw, h, d, as, phi, alphaE, es, fctm } = inp
  if (ms <= 0 || as < 1e-9) {
    return { x: 0, sigmaS: 0, rhoRi: 0, w1: 0, w2: 0, wk: 0 }
  }
  const x = stadium2NeutralAxis(bw, d, as, alphaE)
  const icr = (bw * x ** 3) / 3 + alphaE * as * (d - x) ** 2
  const sigmaS = (alphaE * ms * (d - x)) / icr

  const hef = Math.min(2.5 * (h - d), (h - x) / 3, h / 2)
  const acri = Math.max(bw * hef, 1e-9)
  const rhoRi = as / acri

  const base = (phi / (12.5 * ETA1)) * (sigmaS / es)
  const w1 = base * ((3 * sigmaS) / fctm)
  const w2 = base * (4 / rhoRi + 45)
  return { x, sigmaS, rhoRi, w1, w2, wk: Math.min(w1, w2) }
}

/** NBR 6118 tab. 13.4 — limite de wk (m) p/ concreto armado por CAA */
export function crackLimit(caa: CAA): number {
  if (caa === 'I') return 0.4e-3
  if (caa === 'IV') return 0.2e-3
  return 0.3e-3
}
