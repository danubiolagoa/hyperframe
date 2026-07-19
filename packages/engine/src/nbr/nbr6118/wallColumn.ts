import {
  designColumnSection,
  minimumMoment,
  slenderness,
  type ColumnSectionDef,
} from './columnDesign'

/**
 * Pilar-parede / núcleo rígido — NBR 6118 §15.9 e §18.5.
 *
 * Definição (§14.4.2.4/§18.5): maior dimensão da seção > 5× a espessura.
 *
 * Avaliação aproximada do efeito de 2ª ordem LOCALIZADO (§15.9.3): a parede é
 * decomposta em LÂMINAS verticais de largura ≈ 3·h (h = espessura); cada
 * lâmina é tratada como pilar isolado com:
 *  - N da lâmina pela distribuição LINEAR de tensões da seção bruta
 *    (σ = N/A ± M_forte·y/I — flexão no eixo forte vira diferença de normais);
 *  - esbeltez local λi = 3,46·le/h na direção da espessura, momento mínimo
 *    §11.3.3.4.3 e 2ª ordem local por pilar-padrão (§15.8.3.3.2);
 *  - quinhão do momento fraco proporcional à largura da lâmina.
 * Lâmina TRACIONADA (borda de núcleo sob momento alto) vira tirante:
 * As = |N|/fyd, com nota p/ ancoragem.
 *
 * Mínimos (§18.5): vertical por face com passo ≤ mín(20 cm; 2·h);
 * HORIZONTAL ≥ máx(25% da vertical; 0,15%·Ac) por metro de altura.
 */

export interface WallColumnInput {
  /** comprimento da parede (dimensão longa), m */
  length: number
  /** espessura, m */
  thickness: number
  /** comprimento equivalente vertical (pé-direito do tramo), m */
  le: number
  /** compressão de cálculo, kN */
  nd: number
  /** momento no eixo FORTE (flete ao longo do comprimento), kN·m */
  mStrong: number
  /** momento no eixo fraco (na espessura), kN·m */
  mWeak: number
  cover: number
  fcd: number // kPa
  fyd: number // kPa
  es: number // kPa
}

export interface WallLamina {
  index: number
  width: number
  /** posição do centro (a partir do CG da parede), m */
  s: number
  /** normal da lâmina (+ compressão; − tração), kN */
  nd: number
  lambda: number
  /** momento local de cálculo na espessura, kN·m */
  md: number
  as: number
  tension: boolean
  ok: boolean
}

export interface WallColumnOutput {
  laminas: WallLamina[]
  /** Σ armadura vertical das lâminas, m² */
  asTotal: number
  /** vertical POR METRO POR FACE, m²/m */
  asVFacePerM: number
  vSpec: string
  /** horizontal por metro (total, 2 faces), m²/m */
  asHPerM: number
  hSpec: string
  lambdaMax: number
  needsRigorous: boolean
  tensionEdge: boolean
  ok: boolean
  notes: string[]
}

const V_BARS = [0.01, 0.0125, 0.016, 0.02]
const H_BARS = [0.008, 0.01, 0.0125]

function meshSpec(asPerM: number, bars: number[], sMax: number, suffix: string): string {
  for (const phi of bars) {
    const aPhi = (Math.PI * phi * phi) / 4
    let sp = Math.min(sMax, aPhi / Math.max(asPerM, 1e-9))
    sp = Math.floor(sp / 0.025) * 0.025
    if (sp >= 0.075) {
      const mm = Math.round(phi * 10000) / 10
      return `φ ${mm % 1 === 0 ? mm.toFixed(0) : String(mm).replace('.', ',')} c/ ${Math.round(sp * 100)}${suffix}`
    }
  }
  const phi = bars[bars.length - 1]
  return `φ ${Math.round(phi * 1000)} c/ 7,5${suffix}`
}

export function designWallColumn(inp: WallColumnInput): WallColumnOutput {
  const notes: string[] = []
  const L = inp.length
  const t = inp.thickness
  const A = L * t
  const I = (t * L ** 3) / 12

  // lâminas de largura ≈ 3·h (§15.9.3), iguais
  const n = Math.max(2, Math.ceil(L / (3 * t)))
  const w = L / n

  const laminas: WallLamina[] = []
  let asTotal = 0
  let lambdaMax = 0
  let needsRigorous = false
  let tensionEdge = false
  let allOk = true

  for (let i = 0; i < n; i++) {
    const s = -L / 2 + w * (i + 0.5)
    const sigma = inp.nd / A + (inp.mStrong * s) / I
    const ni = sigma * (w * t)

    if (ni < -1e-6) {
      // borda tracionada: tirante vertical
      const asT = -ni / inp.fyd
      tensionEdge = true
      asTotal += asT
      laminas.push({ index: i, width: w, s, nd: ni, lambda: 0, md: 0, as: asT, tension: true, ok: true })
      continue
    }

    const ndL = Math.max(ni, 1e-6)
    const mMin = minimumMoment(ndL, t)
    const sl = slenderness({
      le: inp.le,
      hDir: t,
      i: t / Math.sqrt(12),
      nd: ndL,
      ac: w * t,
      fcd: inp.fcd,
      ma: mMin,
      mb: mMin,
    })
    const mdLocal = Math.max(mMin, sl.alphaB * mMin + sl.m2) + Math.abs(inp.mWeak) * (w / L)
    lambdaMax = Math.max(lambdaMax, sl.lambda)
    if (sl.needsRigorous) needsRigorous = true

    const sec: ColumnSectionDef = {
      bw: w,
      h: t,
      cover: inp.cover,
      fcd: inp.fcd,
      fyd: inp.fyd,
      es: inp.es,
      shape: 'rect',
      ac: w * t,
      minDim: t,
    }
    const asMinL = Math.max((0.15 * ndL) / inp.fyd, 0.004 * w * t)
    const d = designColumnSection(sec, [{ label: `lâmina ${i + 1}`, nd: ndL, mu: 0, mv: mdLocal }], asMinL)
    const asL = Math.max(d.arrangement?.as ?? asMinL, asMinL)
    asTotal += asL
    if (!d.ok) allOk = false
    laminas.push({
      index: i,
      width: w,
      s,
      nd: ni,
      lambda: sl.lambda,
      md: mdLocal,
      as: asL,
      tension: false,
      ok: d.ok,
    })
  }

  const asVFacePerM = asTotal / (2 * L)
  const sMax = Math.min(0.2, 2 * t)
  const vSpec = meshSpec(asVFacePerM, V_BARS, sMax, ' por face')
  // horizontal: máx(25% da vertical; 0,15% Ac) por metro de altura (2 faces)
  const asHPerM = Math.max(0.25 * (asTotal / L), 0.0015 * t)
  const hSpec = meshSpec(asHPerM / 2, H_BARS, sMax, ' por face')

  notes.push(
    `Pilar-parede (§15.9): ${n} lâminas de ${Math.round(w * 100)} cm (≈ 3·h); λ,máx = ${lambdaMax.toFixed(0)} na espessura; N repartido pela flexão do eixo forte (σ = N/A ± M·y/I).`,
  )
  notes.push(
    `Armadura §18.5 — vertical ${vSpec} · horizontal ${hSpec} (≥ máx(25% da vertical; 0,15%·Ac)).`,
  )
  if (tensionEdge) {
    notes.push(
      'Borda TRACIONADA sob o momento forte — lâmina dimensionada como tirante; ancorar na fundação/tramo abaixo (verificar emendas por tração).',
    )
  }
  if (needsRigorous) {
    notes.push('λ da lâmina > 90 — exige método rigoroso de 2ª ordem localizado (fora do escopo).')
  }

  return {
    laminas,
    asTotal,
    asVFacePerM,
    vSpec,
    asHPerM,
    hSpec,
    lambdaMax,
    needsRigorous,
    tensionEdge,
    ok: allOk,
    notes,
  }
}
