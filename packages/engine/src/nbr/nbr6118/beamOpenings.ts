/**
 * Furos e aberturas em vigas — NBR 6118 §13.2.5.
 *
 * §13.2.5.1: em qualquer caso, a distância do furo à face da viga deve ser
 * ≥ 5 cm e ≥ 2× o cobrimento da face; a seção remanescente deve resistir aos
 * esforços e permitir boa concretagem.
 *
 * §13.2.5.2 (furos que atravessam a viga na direção da largura) — a
 * verificação da abertura é DISPENSADA quando, simultaneamente:
 *  a) o furo está em zona de tração e a uma distância ≥ 2h da face do apoio;
 *  b) a dimensão do furo é ≤ 12 cm e ≤ h/3;
 *  c) a distância entre faces de furos no mesmo tramo é ≥ 2h;
 *  d) os cobrimentos são suficientes e as armaduras não são seccionadas.
 */

export interface OpeningGeometry {
  /** comprimento do furo ao longo do eixo, m */
  width: number
  /** altura do furo, m */
  height: number
  /** desvio do centro em relação ao meio da altura (+ p/ cima), m */
  yOffset: number
}

export interface OpeningCheckInput {
  /** altura da viga no trecho, m */
  h: number
  /** cobrimento nominal da viga, m */
  cover: number
  opening: OpeningGeometry
  /** distância do centro do furo ao apoio mais próximo (eixo), m */
  distToSupport: number
  /** distância livre entre faces do furo vizinho mais próximo, m (null = único) */
  clearToNext: number | null
}

export interface OpeningCondition {
  id: 'face' | 'dimensao' | 'apoio' | 'vizinho'
  label: string
  ok: boolean
}

export interface OpeningCheckOutput {
  conditions: OpeningCondition[]
  /** todas as condições de §13.2.5.2 atendidas — dispensa verificação */
  exempt: boolean
  /** viola a distância mínima à face (§13.2.5.1) — geometria inadequada */
  violated: boolean
  status: 'dispensada' | 'verificar' | 'inadequada'
  notes: string[]
}

export function checkBeamOpening(inp: OpeningCheckInput): OpeningCheckOutput {
  const { h, cover, opening, distToSupport, clearToNext } = inp
  const notes: string[] = []

  // §13.2.5.1 — distância do furo às faces (topo/fundo)
  const edge = h / 2 - (Math.abs(opening.yOffset) + opening.height / 2)
  const edgeMin = Math.max(0.05, 2 * cover)
  const faceOk = edge >= edgeMin - 1e-9
  if (!faceOk) {
    notes.push(
      `Distância à face ${(edge * 100).toFixed(1)} cm < mínimo ${(edgeMin * 100).toFixed(1)} cm (§13.2.5.1).`,
    )
  }

  // §13.2.5.2-b — dimensão ≤ 12 cm e h/3
  const dimMax = Math.max(opening.width, opening.height)
  const dimLimit = Math.min(0.12, h / 3)
  const dimOk = dimMax <= dimLimit + 1e-9
  if (!dimOk) {
    notes.push(
      `Dimensão ${(dimMax * 100).toFixed(0)} cm > limite ${(dimLimit * 100).toFixed(0)} cm (12 cm e h/3) — exige verificação da região.`,
    )
  }

  // §13.2.5.2-a — distância ao apoio ≥ 2h
  const supportOk = distToSupport >= 2 * h - 1e-9
  if (!supportOk) {
    notes.push(
      `Furo a ${distToSupport.toFixed(2)} m do apoio < 2h = ${(2 * h).toFixed(2)} m — exige verificação.`,
    )
  }

  // §13.2.5.2-c — distância entre furos ≥ 2h
  const nextOk = clearToNext === null || clearToNext >= 2 * h - 1e-9
  if (!nextOk) {
    notes.push(
      `Distância livre entre furos ${(clearToNext ?? 0).toFixed(2)} m < 2h = ${(2 * h).toFixed(2)} m — exige verificação.`,
    )
  }

  const conditions: OpeningCondition[] = [
    { id: 'face', label: 'Distância à face ≥ max(5 cm; 2c)', ok: faceOk },
    { id: 'dimensao', label: 'Dimensão ≤ 12 cm e h/3', ok: dimOk },
    { id: 'apoio', label: 'Distância ao apoio ≥ 2h', ok: supportOk },
    { id: 'vizinho', label: 'Entre furos ≥ 2h', ok: nextOk },
  ]
  const exempt = conditions.every((c) => c.ok)
  const violated = !faceOk
  return {
    conditions,
    exempt,
    violated,
    status: violated ? 'inadequada' : exempt ? 'dispensada' : 'verificar',
    notes,
  }
}
