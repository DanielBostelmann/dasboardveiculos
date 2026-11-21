// Instância singleton do PrismaClient.
//
// Em ambientes serverless/Next (e em dev com hot reload), criar um novo
// PrismaClient a cada importação esgota o pool de conexões do Postgres. O
// padrão recomendado reaproveita a mesma instância via uma referência no
// objeto global em desenvolvimento, criando uma nova só quando necessário.
// Docs: https://pris.ly/d/help/next-js-best-practices

import { PrismaClient } from "@prisma/client";

const globalParaPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = prisma;
}
