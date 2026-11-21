// Prepara o banco durante o build (Vercel): aplica as migrações pendentes e,
// se a tabela de veículos estiver vazia, carrega os 112 veículos do CSV.
//
// Roda dentro de `npm run build`, então o primeiro deploy com o banco Neon
// conectado já cria as tabelas e faz a carga inicial, sem passo manual. Nos
// deploys seguintes só aplica migrações novas; o seed NÃO roda de novo quando
// já existem veículos (ele faz upsert por placa e sobrescreveria os dados).
//
// Sem DATABASE_URL: em produção na Vercel o build falha (configuração faltando);
// fora dela (build local, CI sem banco) apenas avisa e segue para o next build.

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

function rodar(comando: string, env: NodeJS.ProcessEnv): void {
  execSync(comando, { stdio: "inherit", env });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    if (process.env.VERCEL_ENV === "production") {
      console.error(
        "[preparar-banco] DATABASE_URL ausente no ambiente de produção. " +
          "Conecte o banco Neon ao projeto na Vercel (Storage) e refaça o deploy.",
      );
      process.exit(1);
    }
    console.warn("[preparar-banco] DATABASE_URL ausente: migrações e seed ignorados.");
    return;
  }

  // O Prisma usa directUrl (conexão sem pooler) para migrar. A integração
  // Neon da Vercel cria DATABASE_URL_UNPOOLED; se ela faltar, cai para a
  // DATABASE_URL para não travar o build.
  const env = { ...process.env };
  if (!env.DATABASE_URL_UNPOOLED) {
    console.warn(
      "[preparar-banco] DATABASE_URL_UNPOOLED ausente: migrando pela DATABASE_URL.",
    );
    env.DATABASE_URL_UNPOOLED = env.DATABASE_URL;
  }

  rodar("npx prisma migrate deploy", env);

  const prisma = new PrismaClient();
  let total: number;
  try {
    total = await prisma.veiculo.count();
  } finally {
    await prisma.$disconnect();
  }

  if (total > 0) {
    console.log(`[preparar-banco] Banco já tem ${total} veículos; seed não executado.`);
    return;
  }

  console.log("[preparar-banco] Banco vazio: carregando os veículos do CSV.");
  rodar("npx tsx prisma/seed.ts", env);
}

main().catch((erro) => {
  console.error("[preparar-banco] Falhou:", erro);
  process.exit(1);
});
