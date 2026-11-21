// Testa o parser/normalização do CSV de veículos (lib/seed-utils.ts) sem banco.
// Confere que o CSV de origem gera 112 veículos e que as contagens por modelo
// batem com build/dashboard/esperado.json (gerado por build/build.py).
//
// O módulo sob teste é TypeScript/ESM; o script `test` registra o loader tsx
// (node --import tsx), então importamos via import() dinâmico.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const CSV_PATH = resolve(ROOT, "build", "fonte", "veiculos.csv");
const ESPERADO_PATH = resolve(ROOT, "build", "dashboard", "esperado.json");

test("parser do CSV: 112 veículos e contagens por modelo batem com esperado.json", async () => {
  const { parseVeiculos, contarPorModelo } = await import("../lib/seed-utils.ts");

  const csvTexto = readFileSync(CSV_PATH, "utf-8");
  const esperado = JSON.parse(readFileSync(ESPERADO_PATH, "utf-8"));

  const veiculos = parseVeiculos(csvTexto);

  assert.equal(veiculos.length, 112, "total de veículos deve ser 112");
  assert.equal(veiculos.length, esperado.total, "total deve bater com esperado.json");

  const porModelo = contarPorModelo(veiculos);
  assert.deepEqual(porModelo, esperado.porModelo, "contagem por modelo deve bater com esperado.json");

  // Valores explícitos (defesa contra mudança acidental de esperado.json).
  assert.deepEqual(porModelo, {
    "VW Polo": 40,
    "VW Virtus Exclusive": 9,
    "VW Virtus TSI": 63,
  });
});

test("parser do CSV: placas são únicas e campos numéricos são inteiros válidos", async () => {
  const { parseVeiculos } = await import("../lib/seed-utils.ts");
  const veiculos = parseVeiculos(readFileSync(CSV_PATH, "utf-8"));

  const placas = new Set(veiculos.map((v) => v.placa));
  assert.equal(placas.size, veiculos.length, "não deve haver placas duplicadas");

  for (const v of veiculos) {
    assert.ok(Number.isInteger(v.km), `km inteiro para ${v.placa}`);
    assert.ok(Number.isInteger(v.fipe), `fipe inteiro para ${v.placa}`);
    assert.ok(Number.isInteger(v.anuncioAtacado), `anuncioAtacado inteiro para ${v.placa}`);
    assert.ok(Number.isInteger(v.diasEstoque), `diasEstoque inteiro para ${v.placa}`);
  }
});

test("normalização de modelo e cor espelha build.py", async () => {
  const { modelo, tituloCor, dif } = await import("../lib/seed-utils.ts");

  assert.equal(modelo("POLO 1.0 TSI FLEX 12V 5P"), "VW Polo");
  assert.equal(modelo("VIRTUS EXCLUSIVE 1.0 TSI"), "VW Virtus Exclusive");
  assert.equal(modelo("VIRTUS TSI 1.0 200 FLEX"), "VW Virtus TSI");

  assert.equal(tituloCor("BRANCO"), "Branco");
  assert.equal(tituloCor("prata"), "Prata");

  // dif = round((anuncio - fipe)/fipe*100, 1), igual a build.py.
  assert.equal(dif(67200, 78082), -13.9);
});
