import type {
  FoundationParams,
  PileKind,
  SoilInteractionParams,
  SoilKind,
  SoilLayerSPT,
} from '../model/types'

/**
 * Interação solo-estrutura — correlações com SPT e molas de apoio.
 *
 * MÉTODOS (clássicos de fundações; valores transcritos da literatura):
 *  - Módulo de deformabilidade Es = α·K·NSPT — Teixeira & Godoy (1996),
 *    apud Cintra, Aoki & Albiero, "Fundações Diretas".
 *  - Recalque elástico de sapata: s = q·B·(1−ν²)·Iw/Es (teoria da
 *    elasticidade, placa em meio semi-infinito; Iw = 0,88 — placa quadrada,
 *    valor médio rígido/flexível).
 *  - Capacidade de estacas: Aoki & Velloso (1975) com K/α por solo e F1/F2
 *    por tipo executivo; carga admissível com FS = 2 (NBR 6122).
 *  - Mola vertical da estaca: encurtamento elástico do fuste
 *    (0,67·N·L/(Ep·Ap) — carga transferida ao longo do fuste) + recalque de
 *    ponta ≈ D/30 na carga admissível (ordem de grandeza usual, Décourt).
 *
 * TODOS os valores são ESTIMATIVAS p/ análise — o projeto executivo de
 * fundações exige sondagens reais e laudo geotécnico (NBR 6122).
 */

// ---------------------------------------------------------------------------
// Teixeira & Godoy — Es = α·K·NSPT
// ---------------------------------------------------------------------------

/** K em MPa (tabela Teixeira & Godoy, 1996) */
const TG_K: Record<SoilKind, number> = {
  areia: 0.9,
  'areia-siltosa': 0.7,
  'areia-argilosa': 0.55,
  'silte-arenoso': 0.45,
  silte: 0.35,
  'silte-argiloso': 0.25,
  'argila-arenosa': 0.3,
  'argila-siltosa': 0.25,
  argila: 0.2,
}

/** α por fração predominante (areia 3, silte 5, argila 7) */
const TG_ALPHA: Record<SoilKind, number> = {
  areia: 3,
  'areia-siltosa': 3,
  'areia-argilosa': 3,
  'silte-arenoso': 5,
  silte: 5,
  'silte-argiloso': 5,
  'argila-arenosa': 7,
  'argila-siltosa': 7,
  argila: 7,
}

/** módulo de deformabilidade da camada, kPa (Es = α·K·NSPT) */
export function soilModulus(soil: SoilKind, nspt: number): number {
  return TG_ALPHA[soil] * TG_K[soil] * 1000 * Math.max(nspt, 1)
}

// ---------------------------------------------------------------------------
// Aoki–Velloso (1975) — K (kPa) e α (%) por solo; F1/F2 por estaca
// ---------------------------------------------------------------------------

const AV_K: Record<SoilKind, number> = {
  areia: 1000,
  'areia-siltosa': 800,
  'areia-argilosa': 600,
  'silte-arenoso': 550,
  silte: 400,
  'silte-argiloso': 230,
  'argila-arenosa': 350,
  'argila-siltosa': 220,
  argila: 200,
}

const AV_ALPHA: Record<SoilKind, number> = {
  areia: 0.014,
  'areia-siltosa': 0.02,
  'areia-argilosa': 0.03,
  'silte-arenoso': 0.022,
  silte: 0.03,
  'silte-argiloso': 0.034,
  'argila-arenosa': 0.024,
  'argila-siltosa': 0.04,
  argila: 0.06,
}

/** fatores de execução F1/F2 (Aoki–Velloso e atualizações usuais) */
const PILE_F: Record<PileKind, { f1: number; f2: number; label: string }> = {
  franki: { f1: 2.5, f2: 5.0, label: 'Franki' },
  metalica: { f1: 1.75, f2: 3.5, label: 'Metálica' },
  'pre-moldada': { f1: 1.75, f2: 3.5, label: 'Pré-moldada' },
  escavada: { f1: 3.0, f2: 6.0, label: 'Escavada' },
  raiz: { f1: 2.0, f2: 4.0, label: 'Raiz' },
  helice: { f1: 2.0, f2: 4.0, label: 'Hélice contínua' },
}

/** módulo do concreto da estaca (aprox.), kPa */
const PILE_E = 25_000_000

export interface PileCapacityResult {
  /** resistência de ponta, kN */
  tip: number
  /** atrito lateral acumulado, kN */
  shaft: number
  /** capacidade última, kN */
  ultimate: number
  /** admissível (FS = 2), kN */
  admissible: number
  /** NSPT na ponta */
  nTip: number
  notes: string[]
}

/** camada na profundidade z (a partir da cota de apoio) */
function layerAt(layers: SoilLayerSPT[], z: number): SoilLayerSPT | null {
  let acc = 0
  for (const l of layers) {
    acc += l.thickness
    if (z <= acc + 1e-9) return l
  }
  return layers.length > 0 ? layers[layers.length - 1] : null
}

/** profundidade total do perfil, m */
export function boringDepth(layers: SoilLayerSPT[]): number {
  return layers.reduce((s, l) => s + l.thickness, 0)
}

/**
 * Capacidade de estaca isolada — Aoki–Velloso (1975).
 * R = K·Np·Ap/F1 + U·Σ(α·K·Nl·ΔL)/F2, admissível com FS = 2.
 */
export function pileCapacityAokiVelloso(
  foundation: Pick<FoundationParams, 'pileDiameter' | 'pileKind' | 'pileLength'>,
  layers: SoilLayerSPT[],
): PileCapacityResult {
  const notes: string[] = []
  const d = foundation.pileDiameter
  const L = foundation.pileLength ?? 8
  const kind = foundation.pileKind ?? 'helice'
  const { f1, f2, label } = PILE_F[kind]
  const ap = (Math.PI * d * d) / 4
  const u = Math.PI * d

  const depth = boringDepth(layers)
  if (L > depth) {
    notes.push(
      `Estaca de ${L.toFixed(1)} m mais profunda que a sondagem (${depth.toFixed(1)} m) — última camada extrapolada.`,
    )
  }

  // atrito lateral por camada (trecho dentro do comprimento da estaca)
  let shaft = 0
  let acc = 0
  for (const l of layers) {
    const z0 = acc
    const z1 = acc + l.thickness
    acc = z1
    const dl = Math.min(z1, L) - z0
    if (dl <= 0) continue
    shaft += (u * AV_ALPHA[l.soil] * AV_K[l.soil] * l.nspt * dl) / f2
  }
  // extrapolação além da sondagem
  if (L > depth && layers.length > 0) {
    const last = layers[layers.length - 1]
    shaft += (u * AV_ALPHA[last.soil] * AV_K[last.soil] * last.nspt * (L - depth)) / f2
  }

  const tipLayer = layerAt(layers, Math.min(L, Math.max(depth, L)))
  const nTip = tipLayer ? tipLayer.nspt : 10
  const tip = tipLayer ? (AV_K[tipLayer.soil] * nTip * ap) / f1 : 0

  const ultimate = tip + shaft
  notes.push(`Aoki–Velloso: ${label} (F1=${f1}; F2=${f2}), NSPT ponta = ${nTip}.`)
  return { tip, shaft, ultimate, admissible: ultimate / 2, nTip, notes }
}

// ---------------------------------------------------------------------------
// Molas de apoio (CRV/CRH) por fundação
// ---------------------------------------------------------------------------

export interface FoundationSprings {
  /** molas de translação, kN/m */
  kv: number
  kh: number
  /** molas de rotação, kN·m/rad (X = em torno de X global etc.) */
  krx: number
  kry: number
  krz: number
  /** Es médio na zona de influência, kPa (sapatas) */
  esAvg: number | null
  notes: string[]
}

/** Es médio ponderado até a profundidade `depth` abaixo do apoio */
export function averageModulus(layers: SoilLayerSPT[], depth: number): number {
  let acc = 0
  let sum = 0
  let used = 0
  for (const l of layers) {
    const dl = Math.min(l.thickness, depth - used)
    if (dl <= 0) break
    sum += soilModulus(l.soil, l.nspt) * dl
    used += dl
    acc = used
  }
  if (acc < depth && layers.length > 0) {
    const last = layers[layers.length - 1]
    sum += soilModulus(last.soil, last.nspt) * (depth - acc)
    acc = depth
  }
  return acc > 0 ? sum / acc : 20_000
}

const IW_RIGID_SQUARE = 0.88

/**
 * Molas de sapata rígida a×b (`aAlongX`: dimensão "a" ao longo do eixo X
 * global): kv = A·Es/(B·(1−ν²)·Iw); rotacionais por módulo de reação uniforme
 * ks = kv/A → kr = ks·I. CRH = chFactor·CRV (prática usual sem ensaio).
 */
export function footingSprings(
  a: number,
  b: number,
  soil: SoilInteractionParams,
  aAlongX = true,
): FoundationSprings {
  const notes: string[] = []
  const bMin = Math.min(a, b)
  // zona de influência ~2B abaixo da base
  const esAvg = averageModulus(soil.layers, 2 * bMin)
  const nu = soil.poisson
  const area = a * b
  const kv = (area * esAvg) / (bMin * (1 - nu * nu) * IW_RIGID_SQUARE)
  const ks = kv / area // kN/m³ (módulo de reação vertical)
  const kra = ks * ((b * a * a * a) / 12) // rotação mobilizando braços na direção "a"
  const krb = ks * ((a * b * b * b) / 12)
  const kh = soil.chFactor * kv
  const krz = 0.5 * (kra + krb)
  notes.push(
    `Sapata ${(a * 100).toFixed(0)}x${(b * 100).toFixed(0)}: Es médio (0–${(2 * bMin).toFixed(1)} m) = ${(esAvg / 1000).toFixed(1)} MPa, ks = ${(ks / 1000).toFixed(0)} MN/m³.`,
  )
  // rotação em torno de X mobiliza braços em Y; a ao longo de X ⇒ braços "b"
  const krx = aAlongX ? krb : kra
  const kry = aAlongX ? kra : krb
  return { kv, kh, krx, kry, krz, esAvg, notes }
}

/**
 * Posições padrão das estacas em coords locais (a, b), m.
 * 1–5: layouts clássicos (linha, triângulo, quadrado, quadrado+centro);
 * ≥ 6: malha retangular linhas×colunas (linha incompleta centrada) — CEB.
 */
export function pileLayout(n: number, e: number): { a: number; b: number }[] {
  switch (n) {
    case 1:
      return [{ a: 0, b: 0 }]
    case 2:
      return [
        { a: -e / 2, b: 0 },
        { a: e / 2, b: 0 },
      ]
    case 3: {
      const r = e / Math.sqrt(3)
      return [
        { a: 0, b: r },
        { a: -e / 2, b: -r / 2 },
        { a: e / 2, b: -r / 2 },
      ]
    }
    case 4:
      return [
        { a: -e / 2, b: -e / 2 },
        { a: e / 2, b: -e / 2 },
        { a: e / 2, b: e / 2 },
        { a: -e / 2, b: e / 2 },
      ]
    case 5:
      return [...pileLayout(4, e), { a: 0, b: 0 }]
    default: {
      const rows = Math.max(2, Math.floor(Math.sqrt(n)))
      const cols = Math.ceil(n / rows)
      const out: { a: number; b: number }[] = []
      let left = n
      for (let r = 0; r < rows && left > 0; r++) {
        const inRow = Math.min(cols, left)
        left -= inRow
        const b = ((rows - 1) / 2 - r) * e
        for (let c = 0; c < inRow; c++) {
          out.push({ a: (c - (inRow - 1) / 2) * e, b })
        }
      }
      return out
    }
  }
}

/** malha do bloco CEB: nº de linhas/colunas usado por pileLayout p/ n ≥ 6 */
export function pileGridDims(n: number): { rows: number; cols: number } {
  const rows = Math.max(2, Math.floor(Math.sqrt(n)))
  return { rows, cols: Math.ceil(n / rows) }
}

/**
 * Molas de bloco sobre estacas: mola vertical da estaca (fuste + ponta) ×
 * layout do grupo. Rotacionais = Σ kv·d² + parcela flexional das estacas.
 */
export function pileCapSprings(
  nPiles: number,
  spacing: number,
  foundation: FoundationParams,
  soil: SoilInteractionParams,
  aAlongX = true,
): FoundationSprings {
  const notes: string[] = []
  const d = foundation.pileDiameter
  const L = foundation.pileLength ?? 8
  const ap = (Math.PI * d * d) / 4
  const cap = pileCapacityAokiVelloso(foundation, soil.layers)

  // recalque na carga admissível: encurtamento (0,67·N·L/EA) + ponta (D/30)
  const nAdm = Math.max(cap.admissible, 1)
  const sElastic = (0.67 * nAdm * L) / (PILE_E * ap)
  const sTip = d / 30
  const kvPile = nAdm / (sElastic + sTip)

  // rigidez flexional da cabeça da estaca (rotação do bloco em estacas 1–2)
  const ip = (Math.PI * d * d * d * d) / 64
  const krPile = (3 * PILE_E * ip) / Math.max(L, 1)

  const layout = pileLayout(nPiles, spacing)
  const kv = nPiles * kvPile
  let sumA2 = 0
  let sumB2 = 0
  for (const p of layout) {
    sumA2 += p.a * p.a
    sumB2 += p.b * p.b
  }
  // rotação mobilizando braços "a" (kra) e "b" (krb) + flexão das estacas
  const kra = kvPile * sumA2 + nPiles * krPile
  const krb = kvPile * sumB2 + nPiles * krPile
  const kh = soil.chFactor * kv * 0.7 // estacas: parcela horizontal menor que sapatas
  const krz = 0.5 * (kra + krb)
  notes.push(...cap.notes)
  notes.push(
    `Estaca: Radm = ${cap.admissible.toFixed(0)} kN, kv = ${(kvPile / 1000).toFixed(1)} MN/m (s ≈ ${((sElastic + sTip) * 1000).toFixed(1)} mm na adm.).`,
  )
  if (nPiles <= 2) {
    notes.push('Bloco de 1–2 estacas: rotação apoiada na flexão das estacas — verifique.')
  }
  const krx = aAlongX ? krb : kra
  const kry = aAlongX ? kra : krb
  return { kv, kh, krx, kry, krz, esAvg: null, notes }
}
