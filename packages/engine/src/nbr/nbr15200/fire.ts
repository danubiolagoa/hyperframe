/**
 * Estruturas em situação de incêndio:
 *  - NBR 14432:2001 tab. A.1 — TRRF por grupo de ocupação × altura (orientativo;
 *    confirmar divisão exata e isenções com a norma e a IT do CB local).
 *  - NBR 15200:2012 — método tabular p/ vigas (tab. 4 e 5) e lajes (tab. 6 e 7)
 *    e método analítico p/ pilares (§8.4, eq. do TRF).
 *
 * Unidades DESTE módulo: mm e minutos (fiel às tabelas da norma).
 */

import type { OccupancyGroup, TRRF } from '../../model/types'

// ---------------------------------------------------------------------------
// NBR 14432 — TRRF por ocupação × altura da edificação
// ---------------------------------------------------------------------------

/** classes de altura: h ≤ 6 · 6 < h ≤ 12 · 12 < h ≤ 23 · 23 < h ≤ 30 · h > 30 (m) */
const TRRF_TABLE: Record<OccupancyGroup, TRRF[]> = {
  A: [30, 30, 60, 90, 120], // residencial
  B: [30, 60, 60, 90, 120], // hospedagem
  C: [60, 60, 60, 90, 120], // comercial varejista
  D: [30, 60, 60, 90, 120], // serviços profissionais
  E: [30, 30, 60, 90, 120], // educacional
  F: [60, 60, 60, 90, 120], // locais de reunião de público
  G: [30, 60, 60, 90, 120], // garagens
  H: [30, 60, 60, 90, 120], // serviços de saúde
}

/** TRRF requerido (min) — NBR 14432 tab. A.1 (h = altura da edificação, m) */
export function requiredTRRF(occupancy: OccupancyGroup, height: number): TRRF {
  const idx = height <= 6 ? 0 : height <= 12 ? 1 : height <= 23 ? 2 : height <= 30 ? 3 : 4
  return TRRF_TABLE[occupancy][idx]
}

// ---------------------------------------------------------------------------
// NBR 15200:2012 — método tabular p/ VIGAS (mm)
// ---------------------------------------------------------------------------

type Combo = [bmin: number, c1: number]

/** tab. 4 — vigas biapoiadas: combinações (bmin, c1) por TRRF */
const BEAM_SIMPLE: Record<number, Combo[]> = {
  30: [
    [80, 25],
    [120, 20],
    [160, 15],
    [190, 15],
  ],
  60: [
    [120, 40],
    [160, 35],
    [190, 30],
    [300, 25],
  ],
  90: [
    [140, 60],
    [190, 45],
    [300, 40],
    [400, 35],
  ],
  120: [
    [190, 68],
    [240, 60],
    [300, 55],
    [500, 50],
  ],
  180: [
    [240, 80],
    [300, 70],
    [400, 65],
    [600, 60],
  ],
}

/** tab. 5 — vigas contínuas ou de pórticos */
const BEAM_CONTINUOUS: Record<number, Combo[]> = {
  30: [
    [80, 15],
    [160, 12],
  ],
  60: [
    [120, 25],
    [190, 12],
  ],
  90: [
    [140, 37],
    [250, 25],
  ],
  120: [
    [190, 45],
    [300, 35],
    [450, 35],
    [500, 30],
  ],
  180: [
    [240, 60],
    [400, 50],
    [550, 50],
    [600, 40],
  ],
}

export interface FireBeamCheck {
  ok: boolean
  /** largura mínima da tabela, mm */
  bMin: number
  /** c1 requerido p/ a largura dada (interpolação linear entre combinações), mm */
  c1Required: number
  notes: string[]
}

/**
 * Verificação de viga (tab. 4/5). `bw` e `c1` em mm. A interpolação linear
 * entre combinações adjacentes é permitida pela norma.
 */
export function checkBeamFire(
  bw: number,
  c1: number,
  trrf: number,
  continuous: boolean,
): FireBeamCheck {
  const table = (continuous ? BEAM_CONTINUOUS : BEAM_SIMPLE)[trrf]
  const notes: string[] = []
  if (!table) {
    return { ok: false, bMin: 0, c1Required: 0, notes: [`TRRF ${trrf} min sem tabela.`] }
  }
  const bMin = table[0][0]
  if (bw < bMin - 1e-9) {
    notes.push(`bw ${bw.toFixed(0)} mm < mínimo ${bMin} mm da tab. ${continuous ? '5' : '4'}.`)
    return { ok: false, bMin, c1Required: table[0][1], notes }
  }
  let c1Required = table[table.length - 1][1]
  for (let i = 0; i < table.length; i++) {
    if (bw <= table[i][0] + 1e-9) {
      if (i === 0 || bw === table[i][0]) {
        c1Required = table[i][1]
      } else {
        const [b0, c0] = table[i - 1]
        const [b1, c1v] = table[i]
        c1Required = c0 + ((c1v - c0) * (bw - b0)) / (b1 - b0)
      }
      break
    }
  }
  return { ok: c1 + 1e-9 >= c1Required, bMin, c1Required, notes }
}

// ---------------------------------------------------------------------------
// NBR 15200:2012 — método tabular p/ LAJES apoiadas em vigas (mm)
// ---------------------------------------------------------------------------

/** tab. 6/7 — h mínimo (função corta-fogo) por TRRF */
const SLAB_H_MIN: Record<number, number> = { 30: 60, 60: 80, 90: 100, 120: 120, 180: 150 }

/** tab. 6 — c1 p/ lajes simplesmente apoiadas: [duas dir λ≤1,5; 1,5<λ≤2; uma dir] */
const SLAB_C1_SIMPLE: Record<number, [number, number, number]> = {
  30: [10, 10, 10],
  60: [10, 15, 20],
  90: [15, 20, 30],
  120: [20, 25, 40],
  180: [30, 40, 55],
}

/** tab. 7 — c1 p/ lajes contínuas */
const SLAB_C1_CONTINUOUS: Record<number, number> = { 30: 10, 60: 10, 90: 15, 120: 20, 180: 30 }

export interface FireSlabCheck {
  ok: boolean
  hMin: number
  c1Required: number
  notes: string[]
}

/**
 * Verificação de laje maciça apoiada em vigas. `h` e `c1` em mm;
 * λ = maior vão/menor vão; `continuous` = alguma borda engastada/contínua.
 */
export function checkSlabFire(
  h: number,
  c1: number,
  trrf: number,
  lambda: number,
  continuous: boolean,
): FireSlabCheck {
  const notes: string[] = []
  const hMin = SLAB_H_MIN[trrf]
  if (hMin === undefined) {
    return { ok: false, hMin: 0, c1Required: 0, notes: [`TRRF ${trrf} min sem tabela.`] }
  }
  let c1Required: number
  if (continuous) {
    c1Required = SLAB_C1_CONTINUOUS[trrf]
  } else {
    const [twoWayA, twoWayB, oneWay] = SLAB_C1_SIMPLE[trrf]
    c1Required = lambda <= 1.5 ? twoWayA : lambda <= 2 ? twoWayB : oneWay
  }
  if (h < hMin - 1e-9) notes.push(`h ${h.toFixed(0)} mm < mínimo corta-fogo ${hMin} mm.`)
  return { ok: h + 1e-9 >= hMin && c1 + 1e-9 >= c1Required, hMin, c1Required, notes }
}

// ---------------------------------------------------------------------------
// NBR 15200:2012 §8.4 — método analítico p/ PILARES
// ---------------------------------------------------------------------------

export interface FireColumnInput {
  /** menor dimensão da seção, mm */
  b: number
  /** maior dimensão da seção, mm */
  h: number
  /** distância do eixo da armadura à face, mm */
  c1: number
  /** comprimento equivalente em situação de incêndio, m (≤ 6) */
  lefFi: number
  /** μfi = NSd,fi/NRd (nível de carregamento em incêndio) */
  muFi: number
  /** número de barras longitudinais */
  nBars: number
}

export interface FireColumnCheck {
  /** tempo de resistência ao fogo calculado, min */
  trf: number
  ok: boolean
  notes: string[]
}

/**
 * TRF = 120·((Rμ + Ra + Rl + Rb + Rn)/120)^1,8  ≥ TRRF, com:
 *   Rμ = 83·(1 − μfi) · Ra = 1,60·(c1 − 30) · Rl = 9,60·(5 − lef,fi)
 *   Rb = 0,09·b′ (190 ≤ b′ ≤ 450; 40,5 se b′ > 450) · Rn = 0 (n = 4) ou 12 (n > 4)
 *   b′ = 2·Ac/(b+h) p/ h ≤ 1,5b · b′ = 1,2·b p/ h > 1,5b
 * Validade: 25 ≤ c1 ≤ 80 mm · lef,fi ≤ 6 m · b′ ≥ 190 mm.
 */
export function checkColumnFire(inp: FireColumnInput, trrf: number): FireColumnCheck {
  const notes: string[] = []
  const { b, h, nBars } = inp
  const c1 = Math.min(Math.max(inp.c1, 25), 80)
  if (inp.c1 < 25) notes.push('c1 < 25 mm — adotado 25 mm (limite do método).')

  const bPrime = h <= 1.5 * b ? (2 * (b * h)) / (b + h) : 1.2 * b
  if (bPrime < 190) {
    notes.push(`b′ = ${bPrime.toFixed(0)} mm < 190 mm — fora do método analítico (aumentar seção).`)
    return { trf: 0, ok: false, notes }
  }
  let lefFi = inp.lefFi
  if (lefFi > 6) {
    notes.push('lef,fi > 6 m — fora do método analítico; adotado 6 m (verificar!).')
    lefFi = 6
  }
  const muFi = Math.min(Math.max(inp.muFi, 0.05), 1)

  const rMu = 83 * (1 - muFi)
  const rA = 1.6 * (c1 - 30)
  const rL = 9.6 * (5 - lefFi)
  const rB = bPrime > 450 ? 40.5 : 0.09 * bPrime
  const rN = nBars > 4 ? 12 : 0

  const sum = Math.max(rMu + rA + rL + rB + rN, 0)
  const trf = 120 * Math.pow(sum / 120, 1.8)
  return { trf, ok: trf + 1e-9 >= trrf, notes }
}
