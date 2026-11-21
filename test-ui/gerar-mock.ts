// Gera test-ui/mock-veiculos.json a partir do CSV de origem, no MESMO formato
// que GET /api/veiculos devolve (campos dias/anuncio/dif/nImagens). Isso permite
// mockar a API no teste de UI do Playwright sem precisar do banco Neon.
//
// Uso: npx tsx test-ui/gerar-mock.ts

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dif, parseVeiculos } from "../lib/seed-utils";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");

const csv = readFileSync(resolve(raiz, "build/fonte/veiculos.csv"), "utf8");
const veiculos = parseVeiculos(csv);

const registros = veiculos.map((v) => ({
  placa: v.placa,
  versao: v.versao,
  modelo: v.modelo,
  ano: v.ano,
  cor: v.cor,
  km: v.km,
  dias: v.diasEstoque,
  loja: v.loja,
  uf: v.uf,
  fipe: v.fipe,
  anuncio: v.anuncioAtacado,
  dif: dif(v.anuncioAtacado, v.fipe),
  utilizacao: v.utilizacao,
  empresa: v.empresa,
  nImagens: 0,
}));

writeFileSync(
  resolve(aqui, "mock-veiculos.json"),
  JSON.stringify(registros, null, 1) + "\n",
  "utf8"
);
console.log(`OK: mock-veiculos.json com ${registros.length} veículos`);
