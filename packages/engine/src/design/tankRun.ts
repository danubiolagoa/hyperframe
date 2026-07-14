import type { Project } from '../model/types'
import type { TankDesignResultItem } from '../analysis/types'
import { bbox } from '../geometry/geometry'
import { concreteProps, coverFor, fyd as fydOf } from '../nbr/nbr6118/materials'
import { designTank } from '../nbr/nbr6118/tanks'
import { TANK_DEFAULTS } from '../model/presets'

/**
 * Dimensiona cada região de reservatório (kind 'reservatorio') como caixa
 * retangular apoiada: dimensões em planta = retângulo envolvente do polígono.
 */
export function runTankDesign(project: Project): TankDesignResultItem[] {
  const cp = concreteProps(
    project.settings.concrete.fck,
    project.settings.concrete.aggregate,
    project.settings.concrete.gammaC,
  )
  const fydV = fydOf(project.settings.steel)
  const cover = coverFor(project.settings.caa).slab
  const out: TankDesignResultItem[] = []

  const levels = [...project.levels].sort((x, y) => x.elevation - y.elevation)
  const seenPlans = new Set<string>()
  for (const level of levels) {
    if (!level.planId || seenPlans.has(level.planId)) continue
    seenPlans.add(level.planId)
    const plan = project.plans.find((p) => p.id === level.planId)
    if (!plan) continue

    for (const region of plan.loadRegions ?? []) {
      if (region.kind !== 'reservatorio' || region.polygon.length < 3) continue
      const tk = { ...TANK_DEFAULTS, ...(region.tank ?? {}) }
      const { min, max } = bbox(region.polygon)
      const a = Math.max(max.x - min.x, 0.5)
      const b = Math.max(max.y - min.y, 0.5)

      const design = designTank({
        a,
        b,
        waterHeight: tk.waterHeight,
        wallThickness: tk.wallThickness,
        bottomThickness: tk.bottomThickness,
        topThickness: tk.topThickness,
        finish: 1.0,
        unitWeight: project.settings.concreteUnitWeight,
        cover,
        fck: cp.fck,
        fcd: cp.fcd,
        fyd: fydV,
        fctm: cp.fctm,
        ecs: cp.ecs,
        es: project.settings.steel.Es,
        psi2: project.settings.psiLive.psi2,
      })

      out.push({
        regionId: region.id,
        name: region.name,
        levelName: level.name,
        design,
        status: design.ok ? 'ok' : 'falha',
      })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}
