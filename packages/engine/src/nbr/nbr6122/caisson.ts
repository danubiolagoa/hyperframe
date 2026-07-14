/**
 * Tubulões a céu aberto (NBR 6122): fuste circular de concreto não armado
 * dimensionado pela tensão admissível do concreto; base alargada circular
 * pela tensão admissível do solo, com rasante a 60° (falsa elipse não
 * modelada). Verificações usuais de execução: fuste ≥ 70 cm (inspeção),
 * altura da base ≤ 1,8 m e alargamento moderado.
 */

export interface CaissonInput {
  /** carga vertical de serviço, kN */
  nServ: number
  /** tensão admissível do solo na cota da base, kPa */
  sigmaAdm: number
  /** tensão admissível no concreto do fuste (não armado), kPa — usual 5000 */
  sigmaConcrete: number
  /** diâmetro mínimo do fuste, m (NBR 6122: 0,70 p/ inspeção) */
  minShaft?: number
}

export interface CaissonResult {
  /** diâmetro do fuste, m */
  shaftD: number
  /** diâmetro da base, m */
  baseD: number
  /** altura da base (rasante 60°), m */
  baseH: number
  /** tensões efetivas, kPa */
  sigmaShaft: number
  sigmaBase: number
  /** volume por metro de fuste + base, m³ (comprimento entra no orçamento) */
  shaftAreaM2: number
  baseVolume: number
  status: 'ok' | 'atencao' | 'falha'
  notes: string[]
}

/** arredonda p/ cima em passos de 5 cm */
const step5 = (v: number): number => Math.ceil(v / 0.05 - 1e-9) * 0.05

export function designCaisson(inp: CaissonInput): CaissonResult {
  const notes: string[] = []
  const minShaft = inp.minShaft ?? 0.7

  // fuste: σc = N/A ≤ σc,adm
  const shaftDCalc = Math.sqrt((4 * inp.nServ) / (Math.PI * inp.sigmaConcrete))
  const shaftD = step5(Math.max(minShaft, shaftDCalc))
  const shaftArea = (Math.PI * shaftD * shaftD) / 4
  const sigmaShaft = inp.nServ / shaftArea

  // base: σsolo = N/Ab ≤ σadm (peso próprio do tubulão desprezado — nota)
  const baseDCalc = Math.sqrt((4 * inp.nServ) / (Math.PI * inp.sigmaAdm))
  const baseD = step5(Math.max(baseDCalc, shaftD))
  const baseArea = (Math.PI * baseD * baseD) / 4
  const sigmaBase = inp.nServ / baseArea

  // rasante 60°: h = (Db − Df)/2 · tan 60°, mínimo prático 20 cm
  const baseH = Math.max(((baseD - shaftD) / 2) * Math.tan(Math.PI / 3), 0.2)

  // volume da base: tronco de cone (Df topo, Db fundo) + rodapé desprezado
  const rf = shaftD / 2
  const rb = baseD / 2
  const baseVolume = (Math.PI * baseH * (rb * rb + rb * rf + rf * rf)) / 3

  let status: CaissonResult['status'] = 'ok'
  if (baseH > 1.8) {
    status = 'atencao'
    notes.push(
      `Altura da base ${baseH.toFixed(2)} m > 1,80 m — NBR 6122 exige escoramento/verificação especial.`,
    )
  }
  if (baseD > 3 * shaftD) {
    status = 'atencao'
    notes.push('Alargamento da base > 3× o fuste — avalie aumentar o fuste ou rebaixar a cota.')
  }
  if (sigmaShaft > inp.sigmaConcrete + 1e-6 || sigmaBase > inp.sigmaAdm + 1e-6) {
    status = 'falha'
  }
  notes.push(
    'Fuste em concreto não armado (armadura de topo p/ ligação com o bloco/pilar); peso próprio do tubulão desprezado nas tensões — a favor da segurança na base alargada em solo escavado.',
  )
  return {
    shaftD,
    baseD,
    baseH,
    sigmaShaft,
    sigmaBase,
    shaftAreaM2: shaftArea,
    baseVolume,
    status,
    notes,
  }
}
