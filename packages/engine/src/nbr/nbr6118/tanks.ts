/**
 * Dimensionamento de reservatórios retangulares apoiados (caixas d'água) —
 * NBR 6118 (flexão §17.2, fissuração §17.3.3) com premissas conservadoras:
 *
 *  - PAREDES: faixa vertical engastada na base e livre no topo (balanço) sob
 *    empuxo hidrostático triangular → M_base = γw·hw³/6 por metro. Despreza a
 *    colaboração das paredes ortogonais (a favor da segurança em plantas
 *    alongadas). Estanqueidade: ELS-W com wk ≤ 0,2 mm (§13.4.2) — a armadura
 *    é aumentada até atender (se possível).
 *  - FUNDO: laje retangular engastada no contorno (monolítica com as paredes),
 *    carga = peso próprio + revestimento + coluna d'água.
 *  - TAMPA: laje apoiada no contorno, sobrecarga de inspeção 1,0 kN/m².
 *
 * γw = 10 kN/m³. Cobrimento mínimo interno de 3 cm (contato com água).
 */

import { designBeamFlexure } from './beamDesign'
import { designSlab, pickSlabBars, type SlabDesignOutput } from './slabDesign'
import { crackWidth } from './cracking'

const GAMMA_W = 10 // kN/m³

export interface TankDesignInput {
  /** dimensões internas em planta, m */
  a: number
  b: number
  /** lâmina d'água, m */
  waterHeight: number
  wallThickness: number
  bottomThickness: number
  topThickness: number
  /** revestimento/impermeabilização, kN/m² */
  finish: number
  unitWeight: number
  cover: number
  fck: number
  fcd: number
  fyd: number
  fctm: number
  ecs: number
  es: number
  psi2: number
}

export interface TankWallResult {
  /** momento característico no engaste da base, kN·m/m */
  mk: number
  /** momento de cálculo, kN·m/m */
  md: number
  /** armadura vertical (face interna/tracionada pela água), m²/m */
  as: number
  spec: string
  /** armadura horizontal (distribuição/retração), m²/m */
  asHoriz: number
  horizSpec: string
  /** abertura de fissura estimada (ELS-W), m */
  wk: number
  wkLimit: number
  ok: boolean
}

export interface TankDesignOutput {
  a: number
  b: number
  waterHeight: number
  /** volume útil, m³ */
  volume: number
  /** peso total em operação (estrutura + água), kN */
  totalWeight: number
  wall: TankWallResult
  bottom: SlabDesignOutput
  top: SlabDesignOutput
  notes: string[]
  ok: boolean
}

export function designTank(inp: TankDesignInput): TankDesignOutput {
  const notes: string[] = []
  const cover = Math.max(inp.cover, 0.03)
  const hw = inp.waterHeight
  const t = inp.wallThickness

  // ------------------------------------------------------------- paredes
  const mk = (GAMMA_W * hw ** 3) / 6
  const md = 1.4 * mk
  const d = Math.max(t - cover - 0.005, 0.5 * t)
  const flex = designBeamFlexure({
    md,
    bw: 1,
    h: t,
    d,
    fcd: inp.fcd,
    fyd: inp.fyd,
    fck: inp.fck,
  })
  const asMin = 0.0015 * t
  let as = Math.max(flex.as, asMin)

  // estanqueidade: wk ≤ 0,2 mm na flexão de serviço; aumenta As até 3× se preciso
  const alphaE = inp.es / inp.ecs
  const wkLimit = 0.2e-3
  const phi = 0.008
  let wk = 0
  for (let iter = 0; iter < 12; iter++) {
    wk = crackWidth({
      ms: mk,
      bw: 1,
      h: t,
      d,
      as,
      phi,
      alphaE,
      es: inp.es,
      fctm: inp.fctm,
    }).wk
    if (wk <= wkLimit || as > 3 * Math.max(flex.as, asMin)) break
    as *= 1.15
  }
  const wallOk = flex.ok && wk <= wkLimit
  if (!flex.ok) {
    notes.push('Parede: seção insuficiente à flexão no engaste — aumentar espessura.')
  }
  if (wk > wkLimit) {
    notes.push('Parede: wk > 0,2 mm mesmo com armadura ampliada — aumentar espessura.')
  }
  // horizontal: 0,15% por face ≈ retração + tração de anel (mínimo prático)
  const asHoriz = Math.max(0.0015 * t, 0.2 * as)

  const wall: TankWallResult = {
    mk,
    md,
    as,
    spec: pickSlabBars(as, t),
    asHoriz,
    horizSpec: pickSlabBars(asHoriz, t),
    wk,
    wkLimit,
    ok: wallOk,
  }

  // -------------------------------------------------------------- fundo
  const bottom = designSlab({
    a: { span: inp.a, fixedEnds: 2 },
    b: { span: inp.b, fixedEnds: 2 },
    thickness: inp.bottomThickness,
    g: inp.bottomThickness * inp.unitWeight + inp.finish,
    q: GAMMA_W * hw,
    psi2: 0.8, // água quase permanente no reservatório cheio
    cover,
    fcd: inp.fcd,
    fck: inp.fck,
    fyd: inp.fyd,
    fctm: inp.fctm,
    ecs: inp.ecs,
  })

  // -------------------------------------------------------------- tampa
  const top = designSlab({
    a: { span: inp.a, fixedEnds: 0 },
    b: { span: inp.b, fixedEnds: 0 },
    thickness: inp.topThickness,
    g: inp.topThickness * inp.unitWeight + 0.5,
    q: 1.0, // inspeção/manutenção
    psi2: inp.psi2,
    cover,
    fcd: inp.fcd,
    fck: inp.fck,
    fyd: inp.fyd,
    fctm: inp.fctm,
    ecs: inp.ecs,
  })

  const volume = inp.a * inp.b * hw
  const perimeter = 2 * (inp.a + inp.b)
  const wallHeight = hw + 0.3 // borda livre
  const structWeight =
    inp.unitWeight *
    (inp.a * inp.b * (inp.bottomThickness + inp.topThickness) + perimeter * t * wallHeight)
  const totalWeight = structWeight + GAMMA_W * volume

  notes.push(
    'Modelo simplificado (paredes em balanço; fundo engastado) — validar com tabelas de placas p/ execução.',
  )

  return {
    a: inp.a,
    b: inp.b,
    waterHeight: hw,
    volume,
    totalWeight,
    wall,
    bottom,
    top,
    notes,
    ok: wallOk && bottom.dirA.ok && bottom.dirB.ok && top.dirA.ok && top.dirB.ok,
  }
}
