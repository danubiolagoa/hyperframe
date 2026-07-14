import { memo } from 'react'
import { polygonCentroid, type LoadRegion } from '@hyperframe/engine'
import { fmt } from '../format'

interface Props {
  regions: LoadRegion[]
  k: number
  selectedId: string | null
  hoveredId: string | null
}

/**
 * Regiões: cargas (escada/reservatório…) em laranja tracejado com "nome / g,q";
 * furos/aberturas em cinza com X de vazio (convenção de planta de forma).
 */
export default memo(function RegionsLayer({ regions, k, selectedId, hoveredId }: Props) {
  return (
    <g>
      {regions.map((rg) => {
        const pts = rg.polygon.map((p) => `${p.x * k},${-p.y * k}`).join(' ')
        const cen = polygonCentroid(rg.polygon)
        const cx = cen.x * k
        const cy = -cen.y * k
        const sel = rg.id === selectedId
        const hov = rg.id === hoveredId && !sel
        const isFuro = rg.kind === 'furo'
        const stairOpening = rg.kind === 'escada' && (rg.stair?.opening ?? true)
        const baseStroke = isFuro ? 'var(--text-dim)' : 'var(--accent)'

        // X de vazio pelo retângulo envolvente (furo e escada com abertura)
        let cross = null
        if ((isFuro || stairOpening) && rg.polygon.length >= 3) {
          let minX = Infinity
          let minY = Infinity
          let maxX = -Infinity
          let maxY = -Infinity
          for (const p of rg.polygon) {
            minX = Math.min(minX, p.x)
            minY = Math.min(minY, p.y)
            maxX = Math.max(maxX, p.x)
            maxY = Math.max(maxY, p.y)
          }
          const stroke = isFuro ? baseStroke : 'rgba(255,160,40,0.5)'
          cross = (
            <>
              <line x1={minX * k} y1={-minY * k} x2={maxX * k} y2={-maxY * k} stroke={stroke} strokeWidth={1} />
              <line x1={minX * k} y1={-maxY * k} x2={maxX * k} y2={-minY * k} stroke={stroke} strokeWidth={1} />
            </>
          )
        }

        return (
          <g key={rg.id}>
            {hov && (
              <polygon points={pts} fill="none" stroke="var(--blue)" strokeWidth={5} opacity={0.3} />
            )}
            <polygon
              points={pts}
              fill={isFuro ? 'rgba(120,128,144,0.13)' : 'rgba(255,160,40,0.08)'}
              stroke={sel ? 'var(--sel)' : hov ? 'var(--blue)' : baseStroke}
              strokeWidth={sel ? 2.5 : 1.5}
              strokeDasharray="4 2"
            />
            {cross}
            {k >= 9 && (
              <text x={cx} y={cy} textAnchor="middle" fontSize={11} fill={baseStroke}>
                <tspan x={cx} dy="-0.15em">
                  {rg.name}
                </tspan>
                <tspan x={cx} dy="1.35em" fontSize={9}>
                  {isFuro ? 'furo / abertura' : `g=${fmt(rg.g, 1)} q=${fmt(rg.q, 1)} kN/m²`}
                </tspan>
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
})
