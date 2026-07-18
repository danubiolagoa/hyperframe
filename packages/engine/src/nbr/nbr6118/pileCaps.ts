/**
 * Blocos rígidos sobre estacas — método das bielas (Blévot & Frémy), conforme
 * NBR 6118 §22.7 (blocos) e prática consagrada (Machado/EPUSP; Bastos/UNESP).
 *
 * Fórmulas (N = carga do pilar; e = espaçamento entre eixos de estacas;
 * ap = pilar quadrado equivalente √(ap·bp); d = altura útil):
 *
 *  2 estacas: tgα = d/(e/2 − ap/4)         Rs = N(2e − ap)/(8d)   [×1,15 exp.]
 *  3 estacas: tgα = d/(e√3/3 − 0,3ap)      Rs,med = N(e√3 − 0,9ap)/(9d)
 *             armadura sobre estacas (lados): R's = Rs,med/√3
 *  4 estacas: tgα = d/(√2/2·(e − ap/2))    Rs,diag = N√2(2e − ap)/(16d)
 *             armadura sobre estacas (lados): R's = N(2e − ap)/(16d)
 *  5 estacas (4 + centro): como 4 estacas com N′ = 4N/5.
 *
 *  Bielas (esmagamento): σ,pil = Nd/(Ap·sen²α) · σ,est = Nd/(n·Ae·sen²α)
 *  Limites (Blévot): 1,4·KR·fcd (2 est.) · 1,75·KR·fcd (3) · 2,1·KR·fcd (4/5),
 *  KR = 0,9 (efeito Rüsch). Ângulo recomendado: 45° ≤ α ≤ 55°.
 *
 *  6–16 estacas: malha retangular + MÉTODO CEB-70 (apud Bastos/UNESP):
 *  flexão na seção S1 (0,15·ap p/ dentro da face do pilar) com as reações das
 *  estacas além da seção, por direção; cortante na seção S2 (d/2 da face)
 *  limitado por VRd2 (§17.4.2.2); bloco rígido: h ≥ (a − ap)/3 (§22.7.1).
 */

import { designBeamFlexure } from './beamDesign'
import { pileLayout, pileGridDims } from '../../geotech/soil'

export interface PileCapInput {
  /** carga vertical de serviço do pilar (G+Q), kN */
  nServ: number
  /** dimensões do pilar, m */
  ap: number
  bp: number
  /** carga admissível por estaca, kN */
  pileCapacity: number
  /** diâmetro da estaca, m */
  pileDiameter: number
  /** espaçamento entre eixos = fator × diâmetro (2,5–3) */
  spacingFactor: number
  /** nº de estacas FIXADO pelo engenheiro (verificação em vez de dimensionamento) */
  nPilesFixed?: number
  fcd: number // kPa
  fyd: number // kPa
}

export interface PileCapResult {
  nPiles: number
  /** diâmetro da estaca adotada, m (p/ desenho) */
  pileDiameter: number
  /** carga de serviço por estaca (com peso próprio do bloco), kN */
  pileLoad: number
  pileCapacity: number
  /** espaçamento entre eixos, m */
  e: number
  d: number
  h: number
  alphaDeg: number
  /** dimensões do bloco em planta, m */
  planA: number
  planB: number
  /** armadura principal (tirante) por direção/lado, m² */
  asMain: number
  mainSpec: string
  /** tensões nas bielas, kPa */
  sigmaPil: number
  sigmaEst: number
  sigmaLim: number
  status: 'ok' | 'atencao' | 'falha'
  notes: string[]
}

const KR = 0.9
const D_PRIME = 0.06 // eixo da armadura à face inferior (5 cm + φ/2)

const REBARS = [0.01, 0.0125, 0.016, 0.02, 0.025]

function pickTieBars(as: number): string {
  if (as < 1e-9) return 'malha mínima'
  for (const phi of REBARS) {
    const aPhi = (Math.PI * phi * phi) / 4
    const n = Math.max(2, Math.ceil(as / aPhi))
    if (n <= 8) {
      const mm = Math.round(phi * 10000) / 10
      return `${n} φ ${mm % 1 === 0 ? mm.toFixed(0) : mm}`
    }
  }
  const phi = REBARS[REBARS.length - 1]
  const n = Math.ceil(as / ((Math.PI * phi * phi) / 4))
  return `${n} φ 25`
}

const round5up = (v: number) => Math.ceil(v / 0.05 - 1e-9) * 0.05

export function designPileCap(inp: PileCapInput): PileCapResult {
  const notes: string[] = []
  const phi = inp.pileDiameter
  const apEq = Math.sqrt(inp.ap * inp.bp)
  const spacing = Math.max(inp.spacingFactor, 2.5) * phi

  // nº de estacas (com ~5% de peso próprio do bloco); 6+ vai p/ o método CEB
  let n = inp.nPilesFixed ?? Math.max(1, Math.ceil((1.05 * inp.nServ) / inp.pileCapacity))
  if (inp.nPilesFixed) {
    notes.push('Nº de estacas fixado manualmente — verificação, não dimensionamento.')
  }
  if (n > 16) {
    notes.push(
      `Carga exige ${n} estacas — acima de 16 fora do escopo (dimensionar bloco especial/radier estaqueado).`,
    )
    n = 16
  }
  if (n >= 6) return designPileCapCEB(inp, n, notes)
  const pileLoad = (1.05 * inp.nServ) / n
  const nd = 1.4 * inp.nServ

  // altura útil no meio da faixa recomendada (α ≈ 50°)
  const lever = spacing - apEq / 2 // (e − ap/2)
  let dTarget: number
  if (n <= 1) dTarget = Math.max(0.6 * phi, 0.4)
  else if (n === 2) dTarget = 0.6 * lever
  else if (n === 3) dTarget = 0.7 * lever
  else dTarget = 0.85 * lever
  const h = Math.max(round5up(dTarget + D_PRIME), 0.4)
  const d = h - D_PRIME

  // ângulo da biela
  let tanAlpha: number
  if (n === 2) tanAlpha = d / (spacing / 2 - apEq / 4)
  else if (n === 3) tanAlpha = d / ((spacing * Math.sqrt(3)) / 3 - 0.3 * apEq)
  else tanAlpha = d / ((Math.sqrt(2) / 2) * (spacing - apEq / 2))
  const alpha = Math.atan(Math.max(tanAlpha, 0.1))
  const alphaDeg = (alpha * 180) / Math.PI
  const sin2 = Math.sin(alpha) ** 2

  // tirantes
  let asMain = 0
  if (n === 2) {
    asMain = (1.15 * nd * (2 * spacing - apEq)) / (8 * d * inp.fyd)
  } else if (n === 3) {
    const rsMed = (nd * (spacing * Math.sqrt(3) - 0.9 * apEq)) / (9 * d)
    asMain = rsMed / Math.sqrt(3) / inp.fyd // por lado, sobre as estacas
  } else if (n >= 4) {
    const nEff = n === 5 ? 0.8 * nd : nd
    asMain = (nEff * (2 * spacing - apEq)) / (16 * d * inp.fyd) // por lado
  }

  // bielas
  const ap2 = inp.ap * inp.bp
  const ae = (Math.PI * phi * phi) / 4
  const sigmaPil = n <= 1 ? nd / ap2 : nd / (ap2 * sin2)
  const sigmaEst = n <= 1 ? nd / ae : nd / (n * ae * sin2)
  const limFactor = n <= 2 ? 1.4 : n === 3 ? 1.75 : 2.1
  const sigmaLim = limFactor * KR * inp.fcd

  // dimensões em planta (folga de 15 cm da face da estaca à borda)
  const edge = phi + 0.3
  let planA: number
  let planB: number
  if (n <= 1) {
    planA = planB = Math.max(edge, inp.ap + 0.2, inp.bp + 0.2)
  } else if (n === 2) {
    planA = spacing + edge
    planB = edge
  } else if (n === 3) {
    planA = spacing + edge
    planB = (spacing * Math.sqrt(3)) / 2 + edge
  } else {
    planA = planB = spacing + edge
  }

  // status
  let status: PileCapResult['status'] = 'ok'
  if (pileLoad > inp.pileCapacity + 1e-6) status = 'falha'
  if (n > 1 && (alphaDeg < 45 - 3 || alphaDeg > 55 + 3)) {
    status = status === 'falha' ? 'falha' : 'atencao'
    notes.push(`Ângulo da biela α = ${alphaDeg.toFixed(0)}° fora de 45–55° — revisar altura.`)
  }
  if (sigmaPil > sigmaLim || sigmaEst > sigmaLim) {
    status = 'falha'
    notes.push('Esmagamento de biela — aumentar seção do pilar/estacas ou fck.')
  }
  if (n === 3) notes.push('Prever armadura de suspensão e malha ortogonal (NBR 6118 §22.7.4).')
  if (n >= 2) notes.push('Verificar ancoragem dos tirantes sobre as estacas (ganchos/laços).')
  notes.push('Capacidade da estaca é geotécnica ORIENTATIVA — exige laudo e prova de carga (NBR 6122).')

  return {
    nPiles: n,
    pileDiameter: phi,
    pileLoad,
    pileCapacity: inp.pileCapacity,
    e: spacing,
    d,
    h,
    alphaDeg,
    planA,
    planB,
    asMain,
    mainSpec: n <= 1 ? 'malha mínima' : pickTieBars(asMain),
    sigmaPil,
    sigmaEst,
    sigmaLim,
    status,
    notes,
  }
}

/** 6–16 estacas: malha retangular + CEB-70 (flexão em S1, cortante em S2) */
function designPileCapCEB(inp: PileCapInput, n: number, notes: string[]): PileCapResult {
  const phi = inp.pileDiameter
  const spacing = Math.max(inp.spacingFactor, 2.5) * phi
  const { rows, cols } = pileGridDims(n)
  const layout = pileLayout(n, spacing)
  const pileLoad = (1.05 * inp.nServ) / n
  const nd = 1.4 * inp.nServ
  const ri = nd / n

  const edge = phi + 0.3
  const planA = (cols - 1) * spacing + edge
  const planB = (rows - 1) * spacing + edge

  // bloco rígido: h ≥ (a − ap)/3 nas duas direções (NBR 6118 §22.7.1)
  const h = Math.max(
    0.6,
    round5up(Math.max((planA - inp.ap) / 3, (planB - inp.bp) / 3) + D_PRIME),
  )
  const d = h - D_PRIME

  // flexão CEB na seção S1 = 0,15·ap p/ DENTRO da face (por direção)
  const flexAt = (colDim: number, coord: (p: { a: number; b: number }) => number, bw: number) => {
    const xS1 = colDim / 2 - 0.15 * colDim
    const m = layout.reduce((sum, pt) => {
      const x = coord(pt)
      return x > xS1 + 1e-9 ? sum + ri * (x - xS1) : sum
    }, 0)
    const f = designBeamFlexure({ md: m, bw, h, d, fcd: inp.fcd, fyd: inp.fyd, fck: inp.fcd * 1.4 })
    return { m, as: f.as, ok: f.ok }
  }
  const dirA = flexAt(inp.ap, (p) => p.a, planB)
  const dirB = flexAt(inp.bp, (p) => p.b, planA)
  const asMain = Math.max(dirA.as, dirB.as)

  // cortante CEB na seção S2 = d/2 da face (pior direção) × VRd2
  const shearAt = (colDim: number, coord: (p: { a: number; b: number }) => number, bw: number) => {
    const xS2 = colDim / 2 + d / 2
    const v = layout.reduce((sum, pt) => (coord(pt) > xS2 + 1e-9 ? sum + ri : sum), 0)
    // fck ≈ γc·fcd (γc = 1,4); αv2 = 1 − fck/250 (fck em MPa)
    const alphaV2 = 1 - (inp.fcd * 1.4) / 1000 / 250
    const vrd2 = 0.27 * alphaV2 * inp.fcd * bw * d
    return { v, vrd2 }
  }
  const shA = shearAt(inp.ap, (p) => p.a, planB)
  const shB = shearAt(inp.bp, (p) => p.b, planA)

  // esmagamento no pilar (apoio direto)
  const sigmaPil = nd / (inp.ap * inp.bp)
  const sigmaEst = nd / (n * ((Math.PI * phi * phi) / 4))
  const sigmaLim = 2.1 * KR * inp.fcd

  const rFar = Math.max(...layout.map((p) => Math.hypot(p.a, p.b)))
  const alphaDeg = (Math.atan(d / Math.max(rFar - Math.sqrt(inp.ap * inp.bp) / 4, 0.1)) * 180) / Math.PI

  let status: PileCapResult['status'] = 'ok'
  if (pileLoad > inp.pileCapacity + 1e-6) status = 'falha'
  if (sigmaPil > sigmaLim || sigmaEst > sigmaLim) {
    status = 'falha'
    notes.push('Esmagamento no apoio — aumentar seção do pilar/estacas ou fck.')
  }
  if (!dirA.ok || !dirB.ok) {
    status = 'falha'
    notes.push('Flexão CEB não coube na altura rígida — aumentar h/planta do bloco.')
  }
  if (shA.v > shA.vrd2 || shB.v > shB.vrd2) {
    status = 'falha'
    notes.push('Cortante na seção S2 excede VRd2 — aumentar h ou a planta do bloco.')
  }

  notes.push(
    `Bloco com ${n} estacas em malha ${rows}×${cols} — método CEB-70 (S1/S2, apud Bastos/UNESP).`,
  )
  notes.push(
    `Armadura por direção: A = ${(dirA.as * 1e4).toFixed(1)} cm² (M=${dirA.m.toFixed(0)} kN·m) · B = ${(dirB.as * 1e4).toFixed(1)} cm² (M=${dirB.m.toFixed(0)} kN·m) — distribuir sobre as estacas.`,
  )
  notes.push('Distribuir a armadura principal sobre as estacas + malha mínima complementar (§22.7.4).')
  notes.push('Verificar punção das estacas de canto e armadura de suspensão (§22.7.4).')
  notes.push('Capacidade da estaca é geotécnica ORIENTATIVA — exige laudo e prova de carga (NBR 6122).')

  return {
    nPiles: n,
    pileDiameter: phi,
    pileLoad,
    pileCapacity: inp.pileCapacity,
    e: spacing,
    d,
    h,
    alphaDeg,
    planA,
    planB,
    asMain,
    mainSpec: pickTieBars(asMain),
    sigmaPil,
    sigmaEst,
    sigmaLim,
    status,
    notes,
  }
}
