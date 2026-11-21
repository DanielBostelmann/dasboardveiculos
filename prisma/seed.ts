// Seed do banco Neon: carrega os 112 veículos de build/fonte/veiculos.csv.
// Idempotente (upsert por placa). NÃO cria imagens.
//
// Executar com: npm run db:seed  (ou: npx prisma db seed)
// Requer DATABASE_URL/DATABASE_URL_UNPOOLED configurados apontando para o Neon.
// No build da Vercel ele roda sozinho, só com o banco vazio (scripts/preparar-banco.ts).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseVeiculos, contarPorModelo } from "../lib/seed-utils";

const prisma = new PrismaClient();

// Caminho do CSV relativo a este arquivo (prisma/seed.ts -> ../build/fonte).
const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, "..", "build", "fonte", "veiculos.csv");

async function main() {
  const csvTexto = readFileSync(CSV_PATH, "utf-8");
  const veiculos = parseVeiculos(csvTexto);

  for (const v of veiculos) {
    await prisma.veiculo.upsert({
      where: { placa: v.placa },
      update: {
        versao: v.versao,
        modelo: v.modelo,
        ano: v.ano,
        cor: v.cor,
        km: v.km,
        diasEstoque: v.diasEstoque,
        loja: v.loja,
        uf: v.uf,
        fipe: v.fipe,
        anuncioAtacado: v.anuncioAtacado,
        utilizacao: v.utilizacao,
        empresa: v.empresa,
      },
      create: {
        placa: v.placa,
        versao: v.versao,
        modelo: v.modelo,
        ano: v.ano,
        cor: v.cor,
        km: v.km,
        diasEstoque: v.diasEstoque,
        loja: v.loja,
        uf: v.uf,
        fipe: v.fipe,
        anuncioAtacado: v.anuncioAtacado,
        utilizacao: v.utilizacao,
        empresa: v.empresa,
      },
    });
  }

  const porModelo = contarPorModelo(veiculos);
  console.log(`Seed concluído: ${veiculos.length} veículos (upsert por placa).`);
  console.log("Contagem por modelo:", porModelo);
  // Esperado (de build/dashboard/esperado.json):
  //   total 112 · VW Polo 40 · VW Virtus Exclusive 9 · VW Virtus TSI 63
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
