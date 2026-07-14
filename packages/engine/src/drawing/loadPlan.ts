/**
 * Planta de cargas na fundação: planta com os pilares e, junto a cada um, as
 * reações características (G, Q, vento) e a envoltória ELU — dados p/ o
 * projetista de fundações. Complementada por tabela lateral.
 */

import type { Project } from '../model/types'
import type { FoundationLoadRow } from '../analysis/types'
import type { Drawing, DrawingPrimitive } from './types'
import { columnFootprint, columnHalfExtents, columnSectionInfo } from '../model/columnSection'
import { boundsOfPrimitives } from './formwork'

const fmt0 = (v: number): string => String(Math.round(v))

export function buildLoadPlanDrawing(project: Project, rows: FoundationLoadRow[]): Drawing {
  const prims: DrawingPrimitive[] = []
  const byId = new Map(rows.map((r) => [r.columnId, r]))

  // ---- pilares + bloco de texto de cargas ----
  for (const col of project.columns) {
    const info = columnSectionInfo(col.section)
    if (info.kind === 'circle') {
      prims.push({
        kind: 'circle',
        cx: col.pos.x,
        cy: col.pos.y,
        r: info.bu / 2,
        layer: 'PILARES',
        filled: true,
      })
    } else {
      prims.push({ kind: 'polyline', points: columnFootprint(col), closed: true, layer: 'PILARES' })
    }
    const { dx, dy } = columnHalfExtents(col)
    const r = byId.get(col.id)
    prims.push({
      kind: 'text',
      x: col.pos.x + dx + 0.06,
      y: col.pos.y + dy + 0.06,
      text: `${col.name} ${info.label}`,
      height: 0.14,
      layer: 'TEXTOS',
    })
    if (r) {
      const g = r.cases.find((c) => c.caseId === 'G')
      const q = r.cases.find((c) => c.caseId === 'Q')
      const lines = [
        `G: ${fmt0(g?.fz ?? 0)} kN`,
        `Q: ${fmt0(q?.fz ?? 0)} kN`,
        `ELU: ${fmt0(r.fzEluMax)} kN`,
      ]
      lines.forEach((t, i) => {
        prims.push({
          kind: 'text',
          x: col.pos.x + dx + 0.06,
          y: col.pos.y - dy - 0.18 - 0.17 * i,
          text: t,
          height: 0.12,
          layer: 'COTAS',
        })
      })
    }
  }

  // ---- tabela lateral (momentos e horizontais na envoltória de serviço) ----
  const b0 = boundsOfPrimitives(prims, 0)
  const x0 = b0.maxX + 1.2
  let y = b0.maxY
  const line = (t: string, h = 0.14): void => {
    prims.push({ kind: 'text', x: x0, y, text: t, height: h, layer: 'TEXTOS' })
    y -= h * 1.6
  }
  line('CARGAS NA FUNDAÇÃO (características, kN / kN·m)', 0.16)
  line('Pilar |   G Fz |   Q Fz | W Fx máx | W Fy máx | Mx máx | My máx', 0.13)
  for (const r of rows) {
    const g = r.cases.find((c) => c.caseId === 'G')
    const q = r.cases.find((c) => c.caseId === 'Q')
    let wfx = 0
    let wfy = 0
    let mx = Math.abs(g?.mx ?? 0) + Math.abs(q?.mx ?? 0)
    let my = Math.abs(g?.my ?? 0) + Math.abs(q?.my ?? 0)
    for (const c of r.cases) {
      if (!c.caseId.startsWith('W')) continue
      wfx = Math.max(wfx, Math.abs(c.fx))
      wfy = Math.max(wfy, Math.abs(c.fy))
      mx = Math.max(mx, Math.abs(c.mx))
      my = Math.max(my, Math.abs(c.my))
    }
    line(
      `${r.name.padEnd(5)} | ${fmt0(g?.fz ?? 0).padStart(6)} | ${fmt0(q?.fz ?? 0).padStart(6)} | ${fmt0(wfx).padStart(8)} | ${fmt0(wfy).padStart(8)} | ${fmt0(mx).padStart(6)} | ${fmt0(my).padStart(6)}`,
      0.13,
    )
  }
  line('Reações no topo da fundação. Vento: máximo entre as 4 direções.', 0.11)

  const title = 'PLANTA DE CARGAS — FUNDAÇÕES'
  const b1 = boundsOfPrimitives(prims, 0)
  prims.push({
    kind: 'text',
    x: b1.minX,
    y: b1.minY - 0.6,
    text: title,
    height: 0.25,
    layer: 'TEXTOS',
  })
  return { title, primitives: prims, bounds: boundsOfPrimitives(prims, 1.5) }
}
