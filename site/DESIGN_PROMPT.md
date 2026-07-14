# Prompt — Design System completo do HyperFrame

> Cole o bloco abaixo numa IA de texto (Claude/ChatGPT/Gemini). No fim há um
> prompt curto separado p/ IAs de IMAGEM (Midjourney/Ideogram) gerarem os
> assets visuais na mesma linguagem. As fotos reais do app estão em
> `site/assets/screenshot-*.png` — use-as no site, não gere mockups falsos.

---

## PROMPT PRINCIPAL (IA de texto → design system)

Você é um designer sênior de produto e marca. Crie o **design system completo
do HyperFrame** — software brasileiro de análise e dimensionamento estrutural
de edifícios de concreto armado pelas normas ABNT (NBR 6118/6120/6123/8681),
concorrente moderno de TQS, Eberick e CypeCAD. App desktop (macOS/Windows) com
tema escuro técnico; o SITE é editorial claro. Público: engenheiros
calculistas brasileiros, 25–55 anos, céticos com software novo — confiança e
precisão importam mais que "startup vibes". Personalidade da marca: precisa,
calma, técnica, honesta (nada de hype); "instrumento de engenharia", não
"ferramenta de growth".

JÁ EXISTE E DEVE SER RESPEITADO (evoluir, não substituir):
- Logo: [descreva aqui o logo escolhido / anexe a imagem]
- Direção do site atual (referências: pax.ai, telepatia.ai, getenter.ai):
  editorial sobre "papel quente", serifa de display p/ títulos, rótulos em
  monoespaçada com letter-spacing largo, hairlines finas, mídia (screenshots)
  em moldura ESCURA arredondada com grade blueprint, faixa de estatísticas
  sobreposta, recursos numerados 01–06, tabela comparativa, card "Pro" escuro,
  CTA final escura.
- Tokens atuais do site (ponto de partida):
  papel #f6f4ee · papel-2 #eeeade · card #fbfaf6 · tinta #1a1912 ·
  tinta-suave #514d41 · tinta-fraca #8a8574 · hairline #e0dbcc /
  #cfc9b6 · ACENTO LARANJA #ffa028 · acento-profundo #a86400 ·
  moldura-escura #131419 (borda #2a2e3a, grade #1e222c) · ok #1d7a4c ·
  erro #b23a31. Serif: Iowan Old Style/Palatino. Sans: system-ui.
  Mono: SF Mono/Menlo.
- O APP é escuro com acento laranja — o site precisa conversar com os
  screenshots reais do app (molduras escuras já resolvem essa ponte).

ENTREGUE, NESTA ORDEM:

1. **Fundamentos**
   - Paleta completa em tabela: nome do token, hex, papel de uso, contraste
     AA verificado (texto sobre papel, texto sobre moldura escura, laranja
     sobre ambos — diga onde o laranja NÃO pode ser usado como texto).
   - Escala tipográfica (display/h1/h2/h3/corpo/legenda/rótulo-mono) com
     tamanhos px + line-height + tracking, e regras de uso da serifa (só
     display/títulos/pull-quotes) vs sans (corpo/UI) vs mono (rótulos,
     números de engenharia, unidades).
   - Espaçamento (escala de 4 ou 8 px), raios de borda, sombras (quase
     nenhuma — o site é plano com hairlines), larguras de contêiner e
     breakpoints.

2. **Componentes** (especificação + HTML/CSS puro de exemplo, sem framework):
   navbar com âncoras · botão primário (laranja)/secundário/ghost · badge e
   "eyebrow" mono · media-frame escura com grade blueprint e tag de versão ·
   stat-strip · card de recurso numerado (01–06) · tabela comparativa
   (coluna do HyperFrame tingida) · cards de preço (Free/Pro escuro em
   destaque/Estudante) · FAQ serifado com <details> · formulário de e-mail
   (beta) · footer com parede de normas NBR · estados hover/focus-visible/
   disabled de tudo · acessibilidade (foco visível, alvos ≥ 44 px, AA).

3. **Imagem e iconografia**
   - Regras p/ screenshots do app (já existem fotos reais): sempre dentro da
     media-frame escura, cantos 14–18 px, tag mono no canto ("v0.2.9 · NBR
     6118"), nunca esticar, sombra sutil única permitida.
   - Estilo de ícones: linha fina 1,5 px, cantos retos "de desenho técnico",
     24 px, sem preenchimento; lista dos 12 ícones necessários (análise,
     pórtico 3D, laje, punção, fundação, vento, prancha, memorial, IA,
     offline, undo, DXF).
   - Texturas permitidas: grade blueprint (linhas 1 px, opacidade ≤ 8%),
     hairlines; PROIBIDO: gradientes coloridos, glassmorphism, 3D genérico,
     fotos de banco de imagem com capacete.

4. **Motion**: durações (150/250 ms), easing, o que anima (opacity/translate
   ≤ 8 px) e o que nunca anima; respeitar prefers-reduced-motion.

5. **Voz e tom (pt-BR)**: 6 regras + microcopy de exemplo — headline do hero,
   sub, CTA, empty state, erro, e-mail de boas-vindas do beta. Tom: direto,
   técnico, primeira pessoa do plural moderada, números com vírgula decimal,
   citar seções de norma quando relevante (ex.: "punção §19.5"). Proibido:
   "revolucionário", "disruptivo", emoji em texto de produto.

6. **Mapa do site** (uma landing): hero com screenshot real + stat-strip →
   prova/validação (relatório comparativo) → recursos numerados → 3 vitrines
   com screenshot (modelagem/dimensionamento/prancha) → comparativo
   TQS/Eberick/CypeCAD honesto → preços → FAQ → CTA beta. Para cada seção:
   objetivo, hierarquia e sugestão de copy.

7. **Entrega final**: bloco único de CSS custom properties (`:root{…}`) com
   TODOS os tokens, pronto p/ colar; e checklist "do/don't" de 10 itens.

Restrições: zero dependências externas (sem Google Fonts — usar as pilhas de
sistema já definidas), performance (LCP < 2 s com a screenshot do hero),
responsivo até 360 px, e tudo em português do Brasil.

---

## PROMPT P/ IA DE IMAGEM (assets na mesma linguagem)

> Use junto com o logo escolhido como referência de estilo.

"Technical editorial illustration for a Brazilian structural engineering
software brand. Warm paper background (#f6f4ee), thin dark hairlines, small
monospaced uppercase labels, ONE accent color orange (#ffa028) used
sparingly. Blueprint-style line drawing of a reinforced concrete building
frame (columns, beams, slabs) with dimension lines and axis bubbles (A, B,
C / 1, 2, 3), drawn like a Brazilian 'planta de forma'. Flat, precise,
1.5px line weight, no gradients, no glossy 3D, no people, no hard shadows.
Composition with generous whitespace, grid faintly visible. — Variações:
(a) hero background ornament, wide 16:9, very subtle; (b) OG/social image
1200×630 with the building drawing on the right third; (c) set of 12 minimal
technical line icons, 24px grid: 3D frame, slab, punching cone, foundation,
wind, drawing sheet, calculation report, AI copilot, offline lock, undo
arrow, DXF file, checkmark seal."

---

### Notas de uso

- As fotos novas do app (v0.2.9, 3200×2000 @2x) já estão em `site/assets/`:
  `screenshot-modeling` (2D+3D com escada), `screenshot-deformed` (3D com
  deformada), `screenshot-results` (estabilidade global), `screenshot-pilares`
  (flexo-compressão) e `screenshot-prancha` (armação com editor de armaduras
  e QUADRO DE FERROS).
- Regenerar fotos após mudanças de UI: `npm run dev` + script
  `shots.mjs` (Playwright + Chrome headless) — pedir ao Claude que ele refaz.
