// GET /api/veiculos (pública)
// Lista os veículos do Neon no formato que a dashboard consome (os mesmos
// campos de CFG.registros em build/build.py, mais nImagens). Mapeia os nomes
// de coluna do schema para os nomes que o app.js antigo espera (diasEstoque ->
// dias, anuncioAtacado -> anuncio) e calcula o campo derivado `dif`.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dif } from "@/lib/seed-utils";

// Precisa do runtime Node (Prisma usa APIs nativas, não roda no edge).
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const veiculos = await prisma.veiculo.findMany({
    orderBy: [{ modelo: "asc" }, { placa: "asc" }],
    include: {
      _count: { select: { imagens: true } },
    },
  });

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
    nImagens: v._count.imagens,
  }));

  return NextResponse.json(registros, {
    headers: {
      // Dados públicos que mudam pouco: cache curto na borda, com revalidação
      // em background para não servir dados velhos por muito tempo.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
