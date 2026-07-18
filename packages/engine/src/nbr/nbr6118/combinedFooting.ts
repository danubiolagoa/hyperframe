import { designBeamFlexure, pickBars } from './beamDesign'

/**
 * Sapata ASSOCIADA (combinada) p/ dois pilares próximos — NBR 6118 §22.6 +
 * prática clássica (Alonso; Cintra/Aoki/Albiero, "Fundações Diretas"):
 *
 *  - retângulo A×B com CG coincidindo com a RESULTANTE das cargas
 *    (xg = N2·L/(N1+N2) a partir do pilar 1) ⇒ pressão uniforme σ = R/(A·B)
 *  - direção longitudinal funciona como viga invertida sob carga uniforme
 *    w = R/A com os pilares como apoios: momento NEGATIVO entre pilares
 *    (tração superior) e positivo nos balanços (tração inferior)
 *  - direção transversal: balanço (B − bp)/2 sob σ, como sapata isolada
 *
 * Momentos (estática exata, pressão uniforme; x medido do bordo esquerdo):
 *  balanço:    M(c) = w·c²/2 (positivo, embaixo do pilar)
 *  entre eixos: M(x) = w·x²/2 − N1'·(x − c)   →  máx. negativo em x = A/2
 */

export interface CombinedFootingInput {
  /** cargas de serviço dos dois pilares (G+Q), kN */
  n1Serv: number
  n2Serv: number
  /** distância entre eixos dos pilares, m */
  L: number
  /** dimensões dos pilares na direção da linha (ap) e transversal (bp), m */
  ap1: number
  bp1: number
  ap2: number
  bp2: number
  sigmaAdm: number // kPa
  fck: number // kPa
  fcd: number // kPa
  fyd: number // kPa
  /** dimensões fixadas (verificação em vez de dimensionamento), m */
  fixed?: { a: number; b: number }
}

export interface CombinedFootingResult {
  /** dimensões em planta: a ao longo da linha dos pilares, m */
  a: number
  b: number
  h: number
  d: number
  /** posição do CG a partir do eixo do pilar 1 (na direção do pilar 2), m */
  xg: number
  sigma: number
  /** momento negativo máximo entre pilares (característico), kN·m */
  mHog: number
  /** momento positivo máximo nos balanços (característico), kN·m */
  mSag: number
  /** armadura longitudinal superior (entre pilares), m² */
  asTop: number
  topSpec: string
  /** armadura longitudinal inferior (balanços), m² */
  asBottom: number
  botSpec: string
  /** armadura transversal inferior, m²/m */
  asTransv: number
  transvSpec: string
  status: 'ok' | 'atencao' | 'falha'
  notes: string[]
}

const D_PRIME = 0.06
const round5up = (v: number) => Math.ceil(v / 0.05 - 1e-9) * 0.05

export function designCombinedFooting(inp: CombinedFootingInput): CombinedFootingResult {
  const notes: string[] = []
  const r = 1.05 * (inp.n1Serv + inp.n2Serv) // ~5% de peso próprio
  const xg = (inp.n2Serv * inp.L) / (inp.n1Serv + inp.n2Serv)

  // planta: A cobre os dois pilares com balanços iguais em torno do CG da carga
  const areaNec = r / inp.sigmaAdm
  let a: number
  let b: number
  if (inp.fixed) {
    a = inp.fixed.a
    b = inp.fixed.b
    notes.push('Dimensões fixadas manualmente — verificação, não dimensionamento.')
  } else {
    // centrada no CG da carga: precisa cobrir o eixo MAIS DISTANTE do CG
    const cover = 2 * Math.max(xg, inp.L - xg) + Math.max(inp.ap1, inp.ap2) + 0.4
    a = round5up(Math.max(cover, Math.sqrt(2 * areaNec)))
    b = round5up(Math.max(areaNec / a, Math.max(inp.bp1, inp.bp2) + 0.4))
  }
  const sigma = r / (a * b)

  // CG da sapata sob a resultante: balanço esquerdo c1 (do bordo ao eixo P1)
  const c1 = a / 2 - xg
  const c2 = a - inp.L - c1
  if (c1 < 0.05 || c2 < 0.05) {
    notes.push('Resultante muito próxima de um bordo — sapata associada não cobre os eixos; rever geometria.')
  }

  // ---- estática longitudinal (serviço): w uniforme, pilares como apoios ----
  const w = r / a
  const n1 = 1.05 * inp.n1Serv
  const mSag = (w * Math.max(c1, c2) ** 2) / 2
  // máximo negativo onde o cortante zera: x0 = N1'/w (limitado ao trecho entre eixos)
  const x0 = Math.min(Math.max(n1 / w, c1), c1 + inp.L)
  const mMidRaw = (w * x0 * x0) / 2 - n1 * (x0 - c1)
  const mHog = Math.max(0, -mMidRaw)
  if (mMidRaw > 0) {
    notes.push('Momento entre pilares resultou positivo (vão curto) — armadura superior fica com o mínimo.')
  }

  // ---- altura: rígida (§22.6.1: h ≥ balanço/3) e flexão coube ----
  let h = Math.max(0.5, round5up(Math.max(c1, c2, (b - Math.max(inp.bp1, inp.bp2)) / 2) / 3 + D_PRIME))
  const flex = (m: number, bw: number, hh: number) =>
    designBeamFlexure({ md: 1.4 * m, bw, h: hh, d: hh - D_PRIME, fcd: inp.fcd, fyd: inp.fyd, fck: inp.fck })
  let fTop = flex(mHog, b, h)
  let fBot = flex(mSag, b, h)
  while ((!fTop.ok || !fBot.ok) && h < 2.0) {
    h = round5up(h + 0.05)
    fTop = flex(mHog, b, h)
    fBot = flex(mSag, b, h)
  }
  const d = h - D_PRIME

  const asTop = Math.max(fTop.as, fTop.asMin)
  const asBottom = Math.max(fBot.as, fBot.asMin)
  const top = pickBars(asTop, b, 0.04)
  const bot = pickBars(asBottom, b, 0.04)

  // ---- transversal: balanço (B − bp)/2 sob σ, faixa de 1 m ----
  const cT = (b - Math.max(inp.bp1, inp.bp2)) / 2
  const mT = (sigma * cT * cT) / 2 // kN·m/m
  const fT = flex(mT, 1, h)
  const asTransv = Math.max(fT.as, fT.asMin)
  const nT = Math.max(2, Math.ceil(asTransv / ((Math.PI * 0.0125 * 0.0125) / 4)))
  const sT = Math.max(0.1, Math.min(0.2, Math.floor(1 / nT / 0.025) * 0.025))
  const transvSpec = `φ 12,5 c/ ${Math.round(sT * 100)}`

  let status: CombinedFootingResult['status'] = 'ok'
  if (sigma > inp.sigmaAdm + 1e-9) {
    status = 'falha'
    notes.push(`σ = ${sigma.toFixed(0)} kPa > σadm = ${inp.sigmaAdm.toFixed(0)} kPa.`)
  }
  if (!fTop.ok || !fBot.ok) {
    status = 'falha'
    notes.push('Flexão longitudinal não coube até h = 2,0 m — rever geometria.')
  }
  if (a / b > 5) {
    if (status === 'ok') status = 'atencao'
    notes.push('A/B > 5 — comportamento de viga de fundação; verificar como baldrame.')
  }
  notes.push('Armadura superior ENTRE os pilares e inferior nos balanços/transversal — §22.6.')
  notes.push('Momentos de pórtico dos pilares não incluídos na associada — verificar excentricidades.')

  return {
    a,
    b,
    h,
    d,
    xg,
    sigma,
    mHog,
    mSag,
    asTop,
    topSpec: top.spec,
    asBottom,
    botSpec: bot.spec,
    asTransv,
    transvSpec,
    status,
    notes,
  }
}
