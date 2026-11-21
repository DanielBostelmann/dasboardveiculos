// Testa a dashboard de veículos: totais, abas, filtros, busca por placa, ajuste de preço e ausência de rede.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const DIR = path.resolve(__dirname, '../..');
const URL = 'file://' + path.join(DIR, 'dashboard-veiculos-pv.html');
const SHOTS = path.join(__dirname, 'shots');
const ESP = JSON.parse(fs.readFileSync(path.join(__dirname, 'esperado.json'), 'utf8'));
fs.mkdirSync(SHOTS, { recursive: true });
const falhas = [];
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : '  FALHA ') + msg); if (!cond) falhas.push(msg); };
const br = n => n.toLocaleString('pt-BR');

async function abrir(browser, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page._erros = []; page._rede = [];
  page.on('pageerror', e => page._erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page._erros.push(m.text()); });
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) page._rede.push(r.url()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__DASH__);
  await page.waitForTimeout(800);
  return { ctx, page };
}
const kpi = (page, k) => page.textContent(`[data-k="${k}"]`).then(t => t.trim());
const semErros = (page, rot) => ok(!page._erros.length, `${rot}: sem erros de script${page._erros.length ? ' → ' + page._erros.join(' | ') : ''}`);
async function semTransbordo(page, rot) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth, fora = [];
    document.querySelectorAll('main *, header *, .filterbar *, .tabs *, .sheet.show *').forEach(e => {
      const b = e.getBoundingClientRect();
      if (b.width && (b.right > w + 1 || b.left < -1) && !e.closest('.chips-row,.seg-ctl,.heat-wrap,.sug')) fora.push(e.className || e.tagName);
    });
    return { larg: document.documentElement.scrollWidth, w, fora: [...new Set(fora)].slice(0, 6) };
  });
  ok(r.larg <= r.w && !r.fora.length, `${rot}: nada passa da largura${r.fora.length ? ' → ' + r.fora.join(', ') : ''}`);
}
const foto = (page, nome, full = true) => page.screenshot({ path: path.join(SHOTS, nome + '.png'), fullPage: full });

(async () => {
  const browser = await chromium.launch();

  console.log('\n1. Celular');
  let { ctx, page } = await abrir(browser);
  const d = await page.evaluate(() => {
    const R = window.__DASH__.REG, mod = {}, cor = {};
    R.forEach(r => { mod[r.modelo] = (mod[r.modelo] || 0) + 1; cor[r.cor] = (cor[r.cor] || 0) + 1; });
    return { n: R.length, mod, cor, anuncio: R.reduce((a, r) => a + r.anuncio, 0), fipe: R.reduce((a, r) => a + r.fipe, 0) };
  });
  const igual = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  ok(d.n === ESP.total, `total de veículos = ${ESP.total}`);
  ok(igual(d.mod, ESP.porModelo), 'veículos por modelo conferem');
  ok(igual(d.cor, ESP.porCor), 'veículos por cor conferem');
  ok(d.anuncio === ESP.somaAnuncio && d.fipe === ESP.somaFipe, `somas: anúncio ${br(d.anuncio)}, FIPE ${br(d.fipe)}`);
  ok(await kpi(page, 'total') === br(ESP.total), `KPI total = ${br(ESP.total)}`);
  ok(/Dados fixos/.test(await page.textContent('#status')) && /não acessa a internet/.test(await page.textContent('#notice')), 'aviso informa dados fixos sem internet');
  await foto(page, 'm-geral');
  for (const t of ['modelos', 'veiculos', 'comparar', 'geral']) {
    await page.click(`.tab[data-v="${t}"]`); await page.waitForTimeout(900);
    await semTransbordo(page, `aba ${t} (celular)`);
    if (t !== 'geral') await foto(page, `m-${t}`);
  }
  // ajuste de preço: -10% reduz o valor final médio
  const medAntes = await kpi(page, 'medio');
  await page.evaluate(() => window.__DASH__.setAjuste(-10)); await page.waitForTimeout(700);
  const finEsp = Math.round(ESP.somaAnuncio * 0.9);
  const finApp = await page.evaluate(() => window.__DASH__.REG.reduce((a, r) => a + window.__DASH__.precoFinal(r), 0));
  ok(finApp === finEsp, `ajuste -10%: soma final = ${br(finEsp)}`);
  ok(await kpi(page, 'medio') !== medAntes, 'ajuste muda o valor final médio no KPI');
  await page.evaluate(() => window.__DASH__.setAjuste(0)); await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__DASH__.AJUSTE) === 0, 'restaurar volta o ajuste a 0');
  // filtro por modelo
  await page.click('.tab[data-v="geral"]'); await page.waitForTimeout(400);
  await page.click('.bar[data-act="cor"][data-v="Vermelho"]'); await page.waitForTimeout(1000);
  ok(await kpi(page, 'total') === br(ESP.porCor['Vermelho']), `filtro cor Vermelho = ${ESP.porCor['Vermelho']}`);
  await page.click('[data-act="limpar"]'); await page.waitForTimeout(1000);
  ok(await kpi(page, 'total') === br(ESP.total), 'limpar volta ao total');
  // busca por placa com autocompletar
  await page.click('.tab[data-v="veiculos"]'); await page.waitForTimeout(500);
  await page.fill('#v-busca', 'RSU7'); await page.waitForTimeout(400);
  const nSug = await page.locator('#v-sug .sug-item').count();
  ok(nSug > 0 && nSug <= 8, `busca “RSU7” sugere ${nSug} placas`);
  await page.fill('#v-busca', 'RSU7B01'); await page.waitForTimeout(400);
  ok(await page.locator('#v-area .veic').count() === 1, 'busca placa completa encontra 1 veículo');
  await page.click('#v-area .veic'); await page.waitForTimeout(700);
  const sh = (await page.textContent('#sheet')).replace(/\s+/g, ' ');
  ok(/RSU7B01/.test(sh) && /104\.740 km/.test(sh) && /POLO|Polo/.test(sh), 'detalhe mostra placa, km e modelo');
  await semTransbordo(page, 'detalhe do veículo');
  await foto(page, 'm-veiculo', false);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('sheet').hidden), 'Esc fecha o painel');
  await page.click('#status'); await page.waitForTimeout(500);
  ok(/FIPE/.test(await page.textContent('#sheet')), 'painel de fontes explica os valores');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  semErros(page, 'celular');
  ok(!page._rede.length, `nenhum acesso à rede${page._rede.length ? ' → ' + page._rede.join(', ') : ''}`);
  await ctx.close();

  console.log('\n2. Computador');
  ({ ctx, page } = await abrir(browser, { width: 1366, height: 900 }));
  await page.click('[data-act="fechar-aviso"]'); await page.waitForTimeout(300);
  await foto(page, 'd-geral');
  for (const t of ['modelos', 'veiculos', 'comparar']) {
    await page.click(`.tab[data-v="${t}"]`); await page.waitForTimeout(900);
    await semTransbordo(page, `aba ${t} (computador)`);
    await foto(page, `d-${t}`);
  }
  await page.click('#btn-theme'); await page.click('.tab[data-v="geral"]'); await page.waitForTimeout(900);
  await foto(page, 'd-geral-escuro', false);
  semErros(page, 'computador');
  ok(!page._rede.length, 'computador: nenhum acesso à rede');
  await ctx.close();

  await browser.close();
  console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nTodos os testes passaram.');
  process.exit(falhas.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
