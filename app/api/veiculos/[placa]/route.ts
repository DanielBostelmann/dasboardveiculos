// GET /api/veiculos/[placa] (pública)
// Detalhe de um veículo com a lista de imagens (apenas ids/ordens/metadados,
// SEM os bytes). A galeria da UI usa esses ids para montar as URLs de
// /api/imagens/[id]. 404 se a placa não existir.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dif } from "@/lib/seed-utils";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ placa: string }> }
): Promise<Response> {
  const { placa } = await params;
  const placaNormalizada = decodeURIComponent(placa).trim().toUpperCase();

  const veiculo = await prisma.veiculo.findUnique({
    where: { placa: placaNormalizada },
    include: {
      imagens: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          ordem: true,
          mimeType: true,
          largura: true,
          altura: true,
          tamanhoBytes: true,
        },
      },
    },
  });

  if (!veiculo) {
    return NextResponse.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  return NextResponse.json(
    {
      placa: veiculo.placa,
      versao: veiculo.versao,
      modelo: veiculo.modelo,
      ano: veiculo.ano,
      cor: veiculo.cor,
      km: veiculo.km,
      dias: veiculo.diasEstoque,
      loja: veiculo.loja,
      uf: veiculo.uf,
      fipe: veiculo.fipe,
      anuncio: veiculo.anuncioAtacado,
      dif: dif(veiculo.anuncioAtacado, veiculo.fipe),
      utilizacao: veiculo.utilizacao,
      empresa: veiculo.empresa,
      imagens: veiculo.imagens,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
