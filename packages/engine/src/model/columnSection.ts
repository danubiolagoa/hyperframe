import type { Column, ColumnSection, Vec2 } from './types'

/**
 * Seções de pilar (retangular, circular e em L) — propriedades geométricas,
 * contorno local e utilidades de orientação em planta.
 *
 * Sistema local da seção: u ao longo de "bw" (largura) e v ao longo de "h"
 * (altura), origem no CENTRÓIDE. No mundo (planta), com rotação θ = rotationDeg:
 * v → (cosθ, sinθ) e u → (−sinθ, cosθ); θ = 0 mantém a convenção histórica
 * (dimensão h ao longo do eixo global X).
 */

export interface ColumnSectionInfo {
  kind: 'rect' | 'circle' | 'L'
  /** contorno local (u, v) centrado no centróide (círculo: polígono de 48 lados) */
  polygon: Vec2[]
  /** área real, m² */
  A: number
  /** ∫u² dA — flexão com gradiente ao longo de u (largura), m⁴ */
  Iu: number
  /** ∫v² dA — flexão com gradiente ao longo de v (altura), m⁴ */
  Iv: number
  /** constante de torção de Saint-Venant (aprox. p/ L), m⁴ */
  J: number
  /** dimensões da caixa envolvente: bu ao longo de u, bv ao longo de v, m */
  bu: number
  bv: number
  /** menor espessura da seção (limita espaçamento de estribo), m */
  minDim: number
  /** perímetro do contorno (área de fôrma por metro), m */
  perimeter: number
  /** rótulo p/ desenhos e relatórios: "25x60", "ø40", "L 50x50 t20/20" */
  label: string
}

/** metros → rótulo em cm: "25", "12,5" */
function cm(m: number): string {
  const c = Math.round(m * 1000) / 10
  return Number.isInteger(c) ? String(c) : String(c).replace('.', ',')
}

/** área, centróide e segundos momentos centrais de polígono (CCW) */
export function polygonSectionProps(poly: Vec2[]): {
  A: number
  cx: number
  cy: number
  Iu: number
  Iv: number
} {
  let a2 = 0
  let cx = 0
  let cy = 0
  let ix = 0 // ∫v² dA (origem)
  let iy = 0 // ∫u² dA (origem)
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    a2 += f
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
    ix += (p.y * p.y + p.y * q.y + q.y * q.y) * f
    iy += (p.x * p.x + p.x * q.x + q.x * q.x) * f
  }
  const A = a2 / 2
  if (Math.abs(A) < 1e-12) return { A: 0, cx: 0, cy: 0, Iu: 0, Iv: 0 }
  cx /= 6 * A
  cy /= 6 * A
  // momentos centrais (teorema dos eixos paralelos)
  const Iv = ix / 12 - A * cy * cy // ∫v²dA
  const Iu = iy / 12 - A * cx * cx // ∫u²dA
  return { A: Math.abs(A), cx, cy, Iu: Math.abs(Iu), Iv: Math.abs(Iv) }
}

/** torção de Saint-Venant p/ retângulo maciço */
function rectJ(bw: number, h: number): number {
  const a = Math.max(bw, h)
  const b = Math.min(bw, h)
  return a * b * b * b * (1 / 3 - 0.21 * (b / a) * (1 - (b * b * b * b) / (12 * a * a * a * a)))
}

const CIRCLE_SEGMENTS = 48

/** contorno do L com origem no canto externo (u→b, v→h), CCW */
function lOutline(b: number, h: number, tb: number, th: number): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: b, y: 0 },
    { x: b, y: th },
    { x: tb, y: th },
    { x: tb, y: h },
    { x: 0, y: h },
  ]
}

/** propriedades completas de uma seção de pilar */
export function columnSectionInfo(section: ColumnSection): ColumnSectionInfo {
  if (section.shape === 'circle') {
    const d = Math.max(section.d, 0.01)
    const r = d / 2
    const A = (Math.PI * d * d) / 4
    const I = (Math.PI * d * d * d * d) / 64
    const polygon: Vec2[] = []
    for (let k = 0; k < CIRCLE_SEGMENTS; k++) {
      const a = (2 * Math.PI * k) / CIRCLE_SEGMENTS
      polygon.push({ x: r * Math.cos(a), y: r * Math.sin(a) })
    }
    return {
      kind: 'circle',
      polygon,
      A,
      Iu: I,
      Iv: I,
      J: (Math.PI * d * d * d * d) / 32,
      bu: d,
      bv: d,
      minDim: d,
      perimeter: Math.PI * d,
      label: `ø${cm(d)}`,
    }
  }
  if (section.shape === 'L') {
    const b = Math.max(section.b, 0.02)
    const h = Math.max(section.h, 0.02)
    const tb = Math.min(Math.max(section.tb, 0.02), b)
    const th = Math.min(Math.max(section.th, 0.02), h)
    const raw = lOutline(b, h, tb, th)
    const props = polygonSectionProps(raw)
    const polygon = raw.map((p) => ({ x: p.x - props.cx, y: p.y - props.cy }))
    let perimeter = 0
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]
      const q = polygon[(i + 1) % polygon.length]
      perimeter += Math.hypot(q.x - p.x, q.y - p.y)
    }
    // torção: perfil aberto de paredes finas, J ≈ Σ(ℓ·t³)/3 por aba
    const J = (b * th * th * th + (h - th) * tb * tb * tb) / 3
    return {
      kind: 'L',
      polygon,
      A: props.A,
      Iu: props.Iu,
      Iv: props.Iv,
      J,
      bu: b,
      bv: h,
      minDim: Math.min(tb, th),
      perimeter,
      label: `L ${cm(b)}x${cm(h)} t${cm(tb)}/${cm(th)}`,
    }
  }
  // retangular (shape ausente em arquivos antigos)
  const bw = Math.max(section.bw, 0.01)
  const h = Math.max(section.h, 0.01)
  return {
    kind: 'rect',
    polygon: [
      { x: -bw / 2, y: -h / 2 },
      { x: bw / 2, y: -h / 2 },
      { x: bw / 2, y: h / 2 },
      { x: -bw / 2, y: h / 2 },
    ],
    A: bw * h,
    Iu: (h * bw * bw * bw) / 12,
    Iv: (bw * h * h * h) / 12,
    J: rectJ(bw, h),
    bu: bw,
    bv: h,
    minDim: Math.min(bw, h),
    perimeter: 2 * (bw + h),
    label: `${cm(bw)}x${cm(h)}`,
  }
}

/** rótulo curto da seção ("25x60", "ø40", "L 50x50 t20/20") */
export function columnSectionLabel(section: ColumnSection): string {
  return columnSectionInfo(section).label
}

/** versores no plano: v (altura h) e u (largura bw) p/ a rotação dada */
export function columnWorldDirs(rotationDeg: number): { vDir: Vec2; uDir: Vec2 } {
  const r = ((rotationDeg % 360) + 360) % 360
  const vDir = r === 0 ? { x: 1, y: 0 } : r === 90 ? { x: 0, y: 1 } : r === 180 ? { x: -1, y: 0 } : { x: 0, y: -1 }
  const uDir = { x: -vDir.y, y: vDir.x }
  return { vDir, uDir }
}

/** contorno da seção em coordenadas de planta (mundo), no ponto do pilar */
export function columnFootprint(
  col: Pick<Column, 'section' | 'rotationDeg' | 'pos'>,
): Vec2[] {
  const info = columnSectionInfo(col.section)
  const { vDir, uDir } = columnWorldDirs(col.rotationDeg)
  return info.polygon.map((p) => ({
    x: col.pos.x + p.y * vDir.x + p.x * uDir.x,
    y: col.pos.y + p.y * vDir.y + p.x * uDir.y,
  }))
}

/** caixa envolvente do pilar em planta (meia-largura em x e y) */
export function columnHalfExtents(
  col: Pick<Column, 'section' | 'rotationDeg'>,
): { dx: number; dy: number } {
  const info = columnSectionInfo(col.section)
  const r = ((col.rotationDeg % 360) + 360) % 360
  const alongX = r === 0 || r === 180 ? info.bv : info.bu
  const alongY = r === 0 || r === 180 ? info.bu : info.bv
  return { dx: alongX / 2, dy: alongY / 2 }
}

/**
 * Contorno recuado (paralelo interno) de polígono RETILÍNEO (arestas paralelas
 * aos eixos) — usado p/ estribos e posicionamento de barras no L.
 */
export function insetRectilinear(poly: Vec2[], t: number): Vec2[] {
  const n = poly.length
  if (n < 4) return poly.map((p) => ({ ...p }))
  // orientação CCW garantida pelos geradores; interior à esquerda das arestas
  const lines: { horizontal: boolean; c: number }[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    if (Math.abs(b.y - a.y) < 1e-12) {
      // horizontal: interior acima se dx>0 (CCW) → desloca +t; senão −t
      lines.push({ horizontal: true, c: a.y + (b.x > a.x ? t : -t) })
    } else {
      // vertical: interior à esquerda → dy>0 desloca −t? não: normal esquerda de (0,dy) é (−sign(dy),0)·(−1)…
      // CCW: interior à esquerda da direção; p/ (0,+dy) esquerda = (−1,0) ⇒ borda direita do interior → desloca −t
      lines.push({ horizontal: false, c: a.x + (b.y > a.y ? -t : t) })
    }
  }
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n]
    const cur = lines[i]
    if (prev.horizontal === cur.horizontal) {
      // arestas colineares consecutivas — degenerado; repete o vértice original
      out.push({ ...poly[i] })
      continue
    }
    out.push(
      prev.horizontal ? { x: cur.c, y: prev.c } : { x: prev.c, y: cur.c },
    )
  }
  return out
}
