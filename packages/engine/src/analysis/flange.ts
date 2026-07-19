import type { Vec2 } from '../model/types'

/**
 * Mesa colaborante — utilidades compartilhadas (§14.6.2.2):
 *  - flankingSlabs: lajes coladas a um segmento de viga (borda colinear com
 *    sobreposição ≥ 50%), com distância livre aproximada e espessura da mesa;
 *  - tSectionInertia: inércia BRUTA da seção T (mesa no topo) p/ a RIGIDEZ
 *    do pórtico (a área p/ peso próprio segue retangular — a laje já pesa).
 */
export function flankingSlabs(
  plan:
    | {
        slabs: {
          polygon: Vec2[]
          thickness: number
          ribbed?: { topping: number }
        }[]
      }
    | undefined,
  p0: Vec2,
  p1: Vec2,
  bw: number,
): { clearLeft: number | null; clearRight: number | null; hf: number | null } {
  if (!plan) return { clearLeft: null, clearRight: null, hf: null }
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  if (len < 0.3) return { clearLeft: null, clearRight: null, hf: null }
  const ux = (p1.x - p0.x) / len
  const uy = (p1.y - p0.y) / len
  const nx = -uy
  const ny = ux
  const TOLD = 0.05
  let clearLeft: number | null = null
  let clearRight: number | null = null
  let hf: number | null = null
  for (const slab of plan.slabs) {
    const poly = slab.polygon
    for (let e = 0; e < poly.length; e++) {
      const a = poly[e]
      const b = poly[(e + 1) % poly.length]
      const dA = Math.abs((a.x - p0.x) * nx + (a.y - p0.y) * ny)
      const dB = Math.abs((b.x - p0.x) * nx + (b.y - p0.y) * ny)
      if (dA > TOLD || dB > TOLD) continue
      const t = (p: Vec2) => (p.x - p0.x) * ux + (p.y - p0.y) * uy
      const lo = Math.max(Math.min(t(a), t(b)), 0)
      const hi = Math.min(Math.max(t(a), t(b)), len)
      if (hi - lo < 0.5 * len) continue
      const ds = poly.map((p) => (p.x - p0.x) * nx + (p.y - p0.y) * ny)
      const dMin = Math.min(...ds)
      const dMax = Math.max(...ds)
      const side = dMax > -dMin ? 1 : -1
      const clear = Math.max(dMax - dMin - bw, 0)
      if (clear < 0.1) continue
      const hSlab = slab.ribbed ? slab.ribbed.topping : slab.thickness
      if (side > 0) clearLeft = Math.max(clearLeft ?? 0, clear)
      else clearRight = Math.max(clearRight ?? 0, clear)
      hf = hf === null ? hSlab : Math.min(hf, hSlab)
    }
  }
  return { clearLeft, clearRight, hf }
}

/** inércia bruta da seção T (mesa comprimida no topo), m⁴ */
export function tSectionInertia(bw: number, h: number, bf: number, hf: number): number {
  const aw = bw * h
  const af = Math.max(bf - bw, 0) * hf
  if (af < 1e-9) return (bw * h ** 3) / 12
  // y medido do TOPO p/ baixo
  const yw = h / 2
  const yf = hf / 2
  const yc = (aw * yw + af * yf) / (aw + af)
  const iw = (bw * h ** 3) / 12 + aw * (yw - yc) ** 2
  const iff = (Math.max(bf - bw, 0) * hf ** 3) / 12 + af * (yf - yc) ** 2
  return iw + iff
}
