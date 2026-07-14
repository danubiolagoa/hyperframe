// Captura screenshots do HyperFrame (dev server em :5183) p/ o site.
// Usa o Chrome instalado via playwright-core (channel: 'chrome').
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const OUT = new URL('./out/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars'],
})
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
})

const shot = async (name) => {
  await sleep(500)
  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log('✓', name)
}

try {
  await page.goto('http://localhost:5183', { waitUntil: 'networkidle', timeout: 30000 })

  // 1) abrir projeto de exemplo (se o modal de boas-vindas aparecer;
  //    em perfil limpo o app já abre direto no exemplo)
  const welcome = page.getByText('Abrir projeto de exemplo', { exact: false }).first()
  if (await welcome.isVisible({ timeout: 5000 }).catch(() => false)) {
    await welcome.click()
    await page.locator('.modal-overlay').waitFor({ state: 'detached', timeout: 10000 })
  }
  await sleep(2500) // editor 2D + 3D montam (three.js compila shaders)

  // vista dividida (padrão) = screenshot de modelagem
  await shot('screenshot-modeling')

  // 2) analisar e esperar os resultados (botão "Resultados" aparece)
  await page.locator('button', { hasText: 'Analisar' }).first().click()
  await page.locator('button', { hasText: 'Resultados' }).first().waitFor({ timeout: 90000 })
  await sleep(800)

  // 3) 3D com deformada — fecha o painel de resultados que abre sozinho
  const tabsVisiveis = () =>
    page
      .locator('button.tab', { hasText: 'Estabilidade' })
      .isVisible()
      .catch(() => false)
  if (await tabsVisiveis()) {
    await page.locator('button', { hasText: 'Resultados' }).first().click()
    await sleep(400)
  }
  await page.locator('[title="3D"]').click()
  await sleep(1500)
  await page.locator('text=Deformada').click()
  // seleciona a 1ª combinação ELU (select do painel "Exibição" com "— selecione —")
  const comboSel = page.locator('select', {
    has: page.locator('option', { hasText: '— selecione —' }),
  })
  if ((await comboSel.count()) > 0) {
    const val = await comboSel
      .first()
      .locator('optgroup >> option')
      .first()
      .getAttribute('value')
    if (val) await comboSel.first().selectOption(val)
  }
  await sleep(1800)
  await shot('screenshot-deformed')

  // 4) painel de resultados — estabilidade global (o painel pode já ter
  //    aberto sozinho ao fim da análise; só clica se as abas não estão lá)
  const tabEst = page.locator('button.tab', { hasText: 'Estabilidade' })
  if (!(await tabEst.isVisible().catch(() => false))) {
    await page.locator('button', { hasText: 'Resultados' }).first().click()
    await sleep(600)
  }
  await tabEst.click()
  await shot('screenshot-results')

  // 5) pilares dimensionados
  await page.locator('button.tab', { hasText: 'Pilares' }).click()
  await shot('screenshot-pilares')

  // 6) prancha de viga com quadro de ferros + editor de armaduras aberto
  await page.locator('button.tab', { hasText: 'Pranchas' }).click()
  await sleep(400)
  const tipoSel = page.locator('select', { has: page.locator('option[value="forma"]') })
  await tipoSel.first().selectOption('vigas')
  await sleep(600)
  const editor = page.locator('text=Editor de armaduras')
  if ((await editor.count()) > 0) await editor.first().click()
  await sleep(600)
  await shot('screenshot-prancha')
} catch (err) {
  console.error('ERRO:', err.message)
  await page.screenshot({ path: `${OUT}_debug.png` })
  const body = await page.locator('body').innerText().catch(() => '?')
  console.error('BODY (1º kB):', body.slice(0, 1000))
  process.exitCode = 1
} finally {
  await browser.close()
}
