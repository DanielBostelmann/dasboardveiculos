// POST /api/veiculos/[placa]/imagens (PROTEGIDA por requireAdmin)
// Recebe multipart/form-data com um arquivo (campo "arquivo" ou "file"),
// valida tipo e tamanho, comprime/redimensiona via sharp e insere a imagem
// no Neon numa transação que primeiro conta as imagens do veículo e rejeita
// a 6ª com 409. Retorna o id e os metadados da imagem criada.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ehViolacaoUnique,
  MAX_IMAGENS_POR_VEICULO,
  podeAceitarMaisImagem,
  processarImagem,
  validarEntradaImagem,
  type MimeTypeAceito,
} from "@/lib/imagens";

export const runtime = "nodejs";

function erro(mensagem: string, status: number): Response {
  return NextResponse.json({ erro: mensagem }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ placa: string }> }
): Promise<Response> {
  // Autenticação ANTES de qualquer efeito colateral ou processamento pesado.
  const guard = await requireAdmin();
  if (guard.response) return guard.response;

  const { placa } = await params;
  const placaNormalizada = decodeURIComponent(placa).trim().toUpperCase();

  const veiculo = await prisma.veiculo.findUnique({
    where: { placa: placaNormalizada },
    select: { id: true },
  });
  if (!veiculo) {
    return erro("nao_encontrado", 404);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return erro("form_invalido", 400);
  }

  const campo = form.get("arquivo") ?? form.get("file") ?? form.get("imagem");
  if (!(campo instanceof File)) {
    return erro("arquivo_ausente", 400);
  }

  const validacao = validarEntradaImagem(campo.type, campo.size);
  if (!validacao.ok) {
    return erro(validacao.erro, validacao.status);
  }

  const entrada = Buffer.from(await campo.arrayBuffer());

  let processada;
  try {
    processada = await processarImagem(entrada, campo.type as MimeTypeAceito);
  } catch (e) {
    if ((e as { imagemInvalida?: boolean }).imagemInvalida) {
      return erro("imagem_invalida", 400);
    }
    throw e;
  }

  // Transação: conta as imagens existentes e, se houver espaço, insere com a
  // próxima ordem. A contagem e a inserção ficam na mesma transação para que a
  // regra de limite seja consistente sob concorrência.
  try {
    const criada = await prisma.$transaction(async (tx) => {
      const quantidade = await tx.imagem.count({ where: { veiculoId: veiculo.id } });
      const limite = podeAceitarMaisImagem(quantidade);
      if (!limite.ok) {
        const err = new Error(limite.erro) as Error & { httpStatus?: number };
        err.httpStatus = limite.status;
        throw err;
      }

      // Próxima ordem: o menor índice livre em 0..MAX-1 (evita colidir com o
      // @@unique([veiculoId, ordem]) mesmo após remoções que deixam buracos).
      const existentes = await tx.imagem.findMany({
        where: { veiculoId: veiculo.id },
        select: { ordem: true },
      });
      const usadas = new Set(existentes.map((i) => i.ordem));
      let proximaOrdem = 0;
      while (proximaOrdem < MAX_IMAGENS_POR_VEICULO && usadas.has(proximaOrdem)) {
        proximaOrdem++;
      }

      return tx.imagem.create({
        data: {
          veiculoId: veiculo.id,
          dados: processada.dados,
          mimeType: processada.mimeType,
          tamanhoBytes: processada.tamanhoBytes,
          largura: processada.largura,
          altura: processada.altura,
          ordem: proximaOrdem,
        },
        select: {
          id: true,
          ordem: true,
          mimeType: true,
          tamanhoBytes: true,
          largura: true,
          altura: true,
        },
      });
    });

    return NextResponse.json(criada, { status: 201 });
  } catch (e) {
    const status = (e as { httpStatus?: number }).httpStatus;
    if (status === 409) {
      return erro("limite_imagens", 409);
    }
    // Corrida no limite de 5: sob Read Committed dois uploads concorrentes
    // podem passar da contagem e colidir no @@unique([veiculoId, ordem]),
    // gerando um P2002. Em vez de um 500 genérico, devolvemos um 409 de
    // conflito coerente (fecha a corrida e qualquer estado de ordem
    // inconsistente). O cliente pode simplesmente repetir o upload.
    if (ehViolacaoUnique(e)) {
      return erro("conflito", 409);
    }
    throw e;
  }
}
