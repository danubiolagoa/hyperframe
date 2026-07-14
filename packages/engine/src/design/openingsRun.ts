import type { Beam, Project } from '../model/types'
import type { BeamOpeningCheckItem } from '../analysis/types'
import { coverFor } from '../nbr/nbr6118/materials'
import { checkBeamOpening } from '../nbr/nbr6118/beamOpenings'
import { dist, projectOnSegment, TOL } from '../geometry/geometry'

/**
 * Verificação dos furos de viga (NBR 6118 §13.2.5) por planta: posição do
 * furo no eixo da viga, altura do trecho, distância a apoios (pilares e
 * extremidades) e ao furo vizinho.
 */

/** comprimento total da polilinha */
function beamLength(beam: Beam): number {
  let L = 0
  for (let i = 0; i + 1 < beam.path.length; i++) L += dist(beam.path[i], beam.path[i + 1])
  return L
}

/** altura da seção na posição x (m ao longo do eixo) */
function sectionHeightAt(beam: Beam, x: number): number {
  let acc = 0
  for (let i = 0; i + 1 < beam.path.length; i++) {
    const l = dist(beam.path[i], beam.path[i + 1])
    if (x <= acc + l || i + 2 === beam.path.length) {
      return (beam.segmentSections?.[i] ?? beam.section).h
    }
    acc += l
  }
  return beam.section.h
}

/** posições (arco) dos apoios: extremidades + pilares sobre o eixo */
function supportPositions(project: Project, beam: Beam): number[] {
  const out: number[] = [0, beamLength(beam)]
  let acc = 0
  for (let i = 0; i + 1 < beam.path.length; i++) {
    const a = beam.path[i]
    const b = beam.path[i + 1]
    const l = dist(a, b)
    if (l < TOL) continue
    for (const col of project.columns) {
      const { t, d } = projectOnSegment(col.pos, a, b)
      if (d <= TOL * 2) out.push(acc + t * l)
    }
    acc += l
  }
  return out.sort((x, y) => x - y)
}

export function runOpeningChecks(project: Project): BeamOpeningCheckItem[] {
  const cover = coverFor(project.settings.caa).beam
  const out: BeamOpeningCheckItem[] = []
  const levelNamesByPlan = new Map<string, string[]>()
  for (const level of project.levels) {
    if (!level.planId) continue
    const list = levelNamesByPlan.get(level.planId) ?? []
    list.push(level.name)
    levelNamesByPlan.set(level.planId, list)
  }

  for (const plan of project.plans) {
    const levelNames = levelNamesByPlan.get(plan.id)
    if (!levelNames || levelNames.length === 0) continue // planta não usada
    for (const beam of plan.beams) {
      const openings = beam.openings ?? []
      if (openings.length === 0) continue
      const L = beamLength(beam)
      const supports = supportPositions(project, beam)
      const sorted = [...openings].sort((a, b) => a.x - b.x)
      sorted.forEach((op, i) => {
        const h = sectionHeightAt(beam, op.x)
        const distToSupport = supports.reduce(
          (m, s) => Math.min(m, Math.abs(op.x - s)),
          Infinity,
        )
        // distância livre ao vizinho mais próximo (faces)
        let clearToNext: number | null = null
        for (const j of [i - 1, i + 1]) {
          const nb = sorted[j]
          if (!nb) continue
          const clear = Math.abs(nb.x - op.x) - (nb.width + op.width) / 2
          clearToNext = clearToNext === null ? clear : Math.min(clearToNext, clear)
        }
        const check = checkBeamOpening({
          h,
          cover,
          opening: { width: op.width, height: op.height, yOffset: op.yOffset },
          distToSupport: distToSupport === Infinity ? 0 : distToSupport,
          clearToNext,
        })
        const notes = [...check.notes]
        if (op.x < -1e-6 || op.x > L + 1e-6) {
          notes.push(`Furo fora do comprimento da viga (x = ${op.x.toFixed(2)} m de ${L.toFixed(2)} m).`)
        }
        out.push({
          beamId: beam.id,
          beamName: beam.name,
          openingId: op.id,
          planName: plan.name,
          levelNames,
          x: op.x,
          width: op.width,
          height: op.height,
          yOffset: op.yOffset,
          label: op.label,
          conditions: check.conditions,
          status: check.status,
          notes,
        })
      })
    }
  }
  return out.sort(
    (a, b) => a.beamName.localeCompare(b.beamName, 'pt-BR', { numeric: true }) || a.x - b.x,
  )
}
