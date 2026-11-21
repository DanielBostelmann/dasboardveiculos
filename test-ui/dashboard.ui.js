// Teste de UI da dashboard Next (FEAT-005), adaptado de build/dashboard/test.js.
// Em vez do HTML estático via file://, roda contra `next start` (servidor local)
// e MOCKA GET /api/veiculos com os dados do CSV (test-ui/mock-veiculos.json),
// já que o sandbox não tem o banco Neon. Também mocka /api/auth/session para
// manter os controles de admin escondidos (visualização pública).
//
// Verifica: total de veículos, troca de abas sem transbordo, busca de placa com
// autocomplete, ajuste -10% recalculando o valor final e exportação CSV.
//
// Uso (ver README):
//   PLAYWRIGHT_BROWSERS_PATH=/projects/sandbox/.kiro/playwright-browsers \
//   PLAYWRIGHT_MODULE=/root/.npm/_npx/.../node_modules/playwright \
//   node test-ui/dashboard.ui.js
// Requer o app já construído (`npm run build`). O script sobe `next start`
// automaticamente numa porta livre e o derruba ao final.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const RAIZ = path.resolve(__dirname, "..");
const REG = JSON.parse(fs.readFileSync(path.join(__dirname, "mock-veiculos.json"), "utf8"));
const PORTA = Number(process.env.PORT_UI || 3123);
const BASE = `http://127.0.0.1:${PORTA}`;

const ESP = {
  total: REG.length,
  somaAnuncio: REG.reduce((a, r) => a + r.anuncio, 0),
  porCor: REG.reduce((m, r) => ((m[r.cor] = (m[r.cor] || 0) + 1), m), {}),
};

const falhas = [];
const ok = (cond, msg) => {
  console.log((cond ? "  ok  " : "  FALHA ") + msg);
  if (!cond) falhas.push(msg);
};
const br = (n) => n.toLocaleString("pt-BR");

function esperarServidor(url, tentativas = 60) {
  return new Promise((resolve, reject) => {
    const tenta = (n) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (n <= 0) return reject(new Error("servidor não subiu a tempo"));
        setTimeout(() => tenta(n - 1), 500);
      });
    };
    tenta(tentativas);
  });
}

async function mockarRotas(ctx) {
  // GET /api/veiculos -> dados do CSV
  await ctx.route("**/api/veiculos", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(REG),
    });
  });
  // sessão: não autenticado (controles de admin escondidos)
  await ctx.route("**/api/auth/session", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ autenticado: false }) })
  );
  // detalhe/galeria: sem fotos (estado vazio) para qualquer placa
  await ctx.route("**/api/veiculos/*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const url = route.request().url();
    const placa = decodeURIComponent(url.split("/").pop().split("?")[0]);
    const r = REG.find((x) => x.placa === placa);
    if (!r) return route.fulfill({ status: 404, contentType: "application/json", body: '{"erro":"nao_encontrado"}' });
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...r, imagens: [] }) });
  });
}

async function semTransbordo(page, rot) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth,
      fora = [];
    document.querySelectorAll("main *, header *, .filterbar *, .tabs *, .sheet.show *").forEach((e) => {
      const b = e.getBoundingClientRect();
      if (b.width && (b.right > w + 1 || b.left < -1) && !e.closest(".chips-row,.seg-ctl,.heat-wrap,.sug"))
        fora.push(e.className || e.tagName);
    });
    return { larg: document.documentElement.scrollWidth, w, fora: [...new Set(fora)].slice(0, 6) };
  });
  ok(r.larg <= r.w && !r.fora.length, `${rot}: nada passa da largura${r.fora.length ? " → " + r.fora.join(", ") : ""}`);
}

const kpi = (page, k) => page.textContent(`[data-k="${k}"]`).then((t) => t.trim());

(async () => {
  console.log("Subindo next start…");
  const servidor = spawn("npm", ["run", "start", "--", "-p", String(PORTA), "-H", "127.0.0.1"], {
    cwd: RAIZ,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  servidor.stdout.on("data", () => {});
  servidor.stderr.on("data", () => {});

  let browser;
  try {
    await esperarServidor(BASE);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mockarRotas(ctx);
    const page = await ctx.newPage();
    const erros = [];
    page.on("pageerror", (e) => erros.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") erros.push(m.text());
    });
    await page.goto(BASE);
    await page.waitForFunction(() => window.__DASH__ && window.__DASH__.REG && window.__DASH__.REG.length > 0, null, { timeout: 15000 });
    await page.waitForTimeout(600);

    // total de veículos
    const n = await page.evaluate(() => window.__DASH__.REG.length);
    ok(n === ESP.total, `total de veículos = ${ESP.total}`);
    ok((await kpi(page, "total")) === br(ESP.total), `KPI total = ${br(ESP.total)}`);
    ok(/Dados do banco/.test(await page.textContent("#status")), "status indica dados do banco");

    // abas sem transbordo
    for (const t of ["modelos", "veiculos", "comparar", "geral"]) {
      await page.click(`.tab[data-v="${t}"]`);
      await page.waitForTimeout(700);
      await semTransbordo(page, `aba ${t}`);
    }

    // ajuste -10% recalcula a soma final
    const medAntes = await kpi(page, "medio");
    await page.evaluate(() => window.__DASH__.setAjuste(-10));
    await page.waitForTimeout(600);
    const finEsp = Math.round(ESP.somaAnuncio * 0.9);
    const finApp = await page.evaluate(() => window.__DASH__.REG.reduce((a, r) => a + window.__DASH__.precoFinal(r), 0));
    ok(finApp === finEsp, `ajuste -10%: soma final = ${br(finEsp)}`);
    ok((await kpi(page, "medio")) !== medAntes, "ajuste muda o valor final médio no KPI");
    await page.evaluate(() => window.__DASH__.setAjuste(0));
    await page.waitForTimeout(400);
    ok((await page.evaluate(() => window.__DASH__.AJUSTE)) === 0, "restaurar volta o ajuste a 0");

    // busca por placa com autocomplete
    await page.click('.tab[data-v="veiculos"]');
    await page.waitForTimeout(500);
    await page.fill("#v-busca", "RSU7");
    await page.waitForTimeout(400);
    const nSug = await page.locator("#v-sug .sug-item").count();
    ok(nSug > 0 && nSug <= 8, `busca “RSU7” sugere ${nSug} placas`);
    await page.fill("#v-busca", "RSU7B01");
    await page.waitForTimeout(400);
    ok((await page.locator("#v-area .veic").count()) === 1, "busca placa completa encontra 1 veículo");
    await page.click("#v-area .veic");
    await page.waitForTimeout(600);
    const sh = (await page.textContent("#sheet")).replace(/\s+/g, " ");
    ok(/RSU7B01/.test(sh) && /POLO|Polo/.test(sh), "detalhe mostra placa e modelo");
    ok(/Sem fotos/.test(sh), "galeria mostra estado vazio sem fotos");
    // controles de admin escondidos (não autenticado)
    ok((await page.locator("#foto-camera, #foto-galeria").count()) === 0, "upload de foto escondido quando não autenticado");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // exportação CSV (limpa a busca antes para exportar o estoque todo)
    await page.fill("#v-busca", "");
    await page.waitForTimeout(400);
    ok((await page.locator("#v-area .veic").count()) === ESP.total, `lista volta aos ${ESP.total} veículos após limpar a busca`);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      page.click('[data-act="csv-veiculos"]'),
    ]);
    const nomeCsv = download.suggestedFilename();
    const destino = path.join(__dirname, nomeCsv);
    await download.saveAs(destino);
    const conteudo = fs.readFileSync(destino, "utf8");
    const linhas = conteudo.trim().split(/\r\n/);
    ok(/^\uFEFF?Placa;Modelo/.test(linhas[0]), "CSV tem cabeçalho esperado");
    ok(linhas.length === ESP.total + 1, `CSV exporta ${ESP.total} veículos + cabeçalho (${linhas.length} linhas)`);
    fs.unlinkSync(destino);

    ok(!erros.length, `sem erros de script${erros.length ? " → " + erros.join(" | ") : ""}`);

    await ctx.close();
  } catch (e) {
    console.error(e);
    falhas.push("exceção: " + e.message);
  } finally {
    if (browser) await browser.close();
    servidor.kill("SIGTERM");
  }

  console.log(falhas.length ? `\n${falhas.length} falha(s).` : "\nTodos os testes de UI passaram.");
  process.exit(falhas.length ? 1 : 0);
})();
