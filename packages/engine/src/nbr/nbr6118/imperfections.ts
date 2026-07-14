/**
 * NBR 6118:2023 §11.3.3.4.1 — imperfeições geométricas globais (desaprumo).
 *
 *   θ1 = 1/(100·√H)   com  1/400 ≤ θ1 ≤ 1/200  (contraventadas: θ1min = 1/300*)
 *   θa = θ1·√((1 + 1/n)/2)
 *
 * (*) A norma fixa θ1max = 1/200 e θ1min = 1/300 p/ estruturas reticuladas.
 * O desaprumo é representado por forças horizontais equivalentes por
 * pavimento: Hi = θa·Pi (Pi = carga vertical introduzida no pavimento i).
 *
 * Regra de combinação com o vento (§11.3.3.4.1 c):
 *  - 0,3·Mvento ≥ Mdesaprumo → considerar somente o vento;
 *  - Mvento < 0,3·Mdesaprumo → considerar somente o desaprumo;
 *  - demais casos → vento + desaprumo somados (mesma direção/sentido), sem θ1min.
 * A comparação é feita pelo momento de tombamento na base.
 */

export interface NotionalLevelLoad {
  levelIndex: number
  z: number
  /** força horizontal equivalente do desaprumo no nível, kN */
  F: number
}

export interface NotionalLoadsResult {
  /** desaprumo do eixo, rad */
  theta1: number
  /** desaprumo reduzido p/ n prumadas, rad */
  thetaA: number
  perLevel: NotionalLevelLoad[]
  /** momento de tombamento na base, kN·m */
  baseMoment: number
}

/**
 * Forças horizontais equivalentes do desaprumo global.
 * @param totalHeight altura total H da edificação, m
 * @param nColumns número de prumadas de pilares contínuas (n)
 * @param levels cargas verticais características (G+Q) introduzidas por nível
 */
export function notionalLoads(
  totalHeight: number,
  nColumns: number,
  levels: { levelIndex: number; z: number; weight: number }[],
): NotionalLoadsResult {
  const H = Math.max(totalHeight, 0.01)
  const n = Math.max(1, nColumns)
  let theta1 = 1 / (100 * Math.sqrt(H))
  // limites p/ estruturas reticuladas: 1/300 ≤ θ1 ≤ 1/200
  theta1 = Math.min(Math.max(theta1, 1 / 300), 1 / 200)
  const thetaA = theta1 * Math.sqrt((1 + 1 / n) / 2)

  const perLevel: NotionalLevelLoad[] = levels.map((l) => ({
    levelIndex: l.levelIndex,
    z: l.z,
    F: thetaA * Math.max(0, l.weight),
  }))
  const baseMoment = perLevel.reduce((s, l) => s + l.F * l.z, 0)
  return { theta1, thetaA, perLevel, baseMoment }
}

export type WindNotionalRule = 'somente-vento' | 'somente-desaprumo' | 'vento+desaprumo'

/**
 * Regra do §11.3.3.4.1 c) — decide como compor vento e desaprumo a partir dos
 * momentos de tombamento na base (valores característicos, mesma direção).
 */
export function windNotionalRule(mWind: number, mNotional: number): WindNotionalRule {
  const mw = Math.abs(mWind)
  const mn = Math.abs(mNotional)
  if (0.3 * mw >= mn) return 'somente-vento'
  if (mw < 0.3 * mn) return 'somente-desaprumo'
  return 'vento+desaprumo'
}
