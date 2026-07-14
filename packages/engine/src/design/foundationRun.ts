import type { Project } from '../model/types'
import type {
  AnalysisModel,
  CaseId,
  CaseResult,
  FoundationResultItem,
} from '../analysis/types'
import { concreteProps, fyd as fydOf } from '../nbr/nbr6118/materials'
import { designFooting } from '../nbr/nbr6118/foundations'
import { designPileCap } from '../nbr/nbr6118/pileCaps'
import { designCaisson } from '../nbr/nbr6122/caisson'
import { columnSectionInfo } from '../model/columnSection'

/**
 * Pré-dimensionamento das fundações a partir das reações de serviço
 * (G + Q característicos, passe ELS): sapatas isoladas OU blocos sobre
 * estacas (método das bielas), conforme settings.foundation.type.
 */
export function runFoundationDesign(
  project: Project,
  model: AnalysisModel,
  casesEls: Partial<Record<CaseId, CaseResult>>,
): FoundationResultItem[] {
  const g = casesEls.G
  const q = casesEls.Q
  if (!g) return []
  const fydV = fydOf(project.settings.steel)
  const usePiles = project.settings.foundation.type === 'estacas'
  const cp = concreteProps(
    project.settings.concrete.fck,
    project.settings.concrete.aggregate,
    project.settings.concrete.gammaC,
  )
  const out: FoundationResultItem[] = []

  const reactionAt = (cr: CaseResult | undefined, nodeId: number) =>
    cr?.reactions.find((r) => r.nodeId === nodeId)

  for (const col of project.columns) {
    // nó de apoio do pilar (base)
    const node = model.nodes.find(
      (n) =>
        n.support &&
        Math.abs(n.x - col.pos.x) < 0.05 &&
        Math.abs(n.y - col.pos.y) < 0.05,
    )
    if (!node) continue
    const rg = reactionAt(g, node.id)
    const rq = reactionAt(q, node.id)
    if (!rg) continue
    const nServ = rg.fz + (rq?.fz ?? 0)
    if (nServ <= 1e-6) continue
    const mxServ = Math.abs(rg.mx + (rq?.mx ?? 0)) // em torno de X → excentricidade em Y
    const myServ = Math.abs(rg.my + (rq?.my ?? 0)) // em torno de Y → excentricidade em X

    // direção a = dimensão h do pilar (rot 0/180 → h ao longo de X)
    const info = columnSectionInfo(col.section)
    const alongX = col.rotationDeg === 0 || col.rotationDeg === 180
    const ap = info.bv
    const bp = info.bu
    const ma = alongX ? myServ : mxServ
    const mb = alongX ? mxServ : myServ

    if (project.settings.foundation.type === 'tubulao') {
      const caisson = designCaisson({
        nServ,
        sigmaAdm: project.settings.soil.sigmaAdm,
        sigmaConcrete: project.settings.foundation.caissonSigmaConcrete ?? 5000,
      })
      if (ma + mb > 0.05 * nServ * Math.max(ap, bp)) {
        caisson.notes.push('Momentos na base não considerados no tubulão — verificar excentricidades.')
      }
      out.push({
        columnId: col.id,
        name: col.name,
        nServ,
        kind: 'tubulao',
        footing: null,
        pileCap: null,
        caisson,
        status: caisson.status,
      })
      continue
    }

    if (usePiles) {
      const pileCap = designPileCap({
        nServ,
        ap,
        bp,
        pileCapacity: project.settings.foundation.pileCapacity,
        pileDiameter: project.settings.foundation.pileDiameter,
        spacingFactor: project.settings.foundation.pileSpacingFactor,
        fcd: cp.fcd,
        fyd: fydV,
      })
      if (ma + mb > 0.05 * nServ * Math.max(ap, bp)) {
        pileCap.notes.push(
          'Momentos na base não considerados na divisão de carga entre estacas — verificar.',
        )
      }
      out.push({
        columnId: col.id,
        name: col.name,
        nServ,
        kind: 'bloco',
        footing: null,
        pileCap,
        caisson: null,
        status: pileCap.status,
      })
      continue
    }

    const footing = designFooting({
      nServ,
      ma,
      mb,
      ap,
      bp,
      sigmaAdm: project.settings.soil.sigmaAdm,
      fyd: fydV,
    })

    out.push({
      columnId: col.id,
      name: col.name,
      nServ,
      kind: 'sapata',
      footing,
      pileCap: null,
      caisson: null,
      status: footing.status,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}
