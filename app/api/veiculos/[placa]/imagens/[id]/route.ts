// DELETE /api/veiculos/[placa]/imagens/[id] (PROTEGIDA por requireAdmin)
// Remove uma imagem do veículo e reatribui as ordens das restantes para
// mantê-las contíguas (0..n-1), respeitando o @@unique([veiculoId, ordem]).
// Retorna 204 em sucesso. 404 se o veículo ou a imagem não existir.

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function erro(mensagem: string, status: number): Response {
  return NextResponse.json({ erro: mensagem }, { status });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ placa: string; id: string }> }
): Promise<Response> {
  // Autenticação ANTES de qualquer efeito colateral.
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { placa, id } = await params;
  const placaNormalizada = decodeURIComponent(placa).trim().toUpperCase();

  const veiculo = await prisma.veiculo.findUnique({
    where: { placa: placaNormalizada },
    select: { id: true },
  });
  if (!veiculo) {
    return erro("nao_encontrado", 404);
  }

  const imagem = await prisma.imagem.findUnique({
    where: { id },
    select: { id: true, veiculoId: true },
  });
  // A imagem precisa existir E pertencer ao veículo da rota.
  if (!imagem || imagem.veiculoId !== veiculo.id) {
    return erro("nao_encontrado", 404);
  }

  await prisma.$transaction(async (tx) => {
    await tx.imagem.delete({ where: { id: imagem.id } });

    // Reordenar as restantes para 0..n-1. Como há @@unique([veiculoId, ordem]),
    // deslocar em duas fases (primeiro para um intervalo alto temporário, depois
    // para os valores finais) evita colisões intermediárias de ordem.
    const restantes = await tx.imagem.findMany({
      where: { veiculoId: veiculo.id },
      orderBy: { ordem: "asc" },
      select: { id: true },
    });

    const OFFSET_TEMP = 1000;
    for (let i = 0; i < restantes.length; i++) {
      await tx.imagem.update({
        where: { id: restantes[i]!.id },
        data: { ordem: OFFSET_TEMP + i },
      });
    }
    for (let i = 0; i < restantes.length; i++) {
      await tx.imagem.update({
        where: { id: restantes[i]!.id },
        data: { ordem: i },
      });
    }
  });

  return new NextResponse(null, { status: 204 });
}
