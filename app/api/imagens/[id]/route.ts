// GET /api/imagens/[id] (pública)
// Serve os bytes de uma imagem gravada no Neon (coluna bytea). Como o id é
// único por upload (o conteúdo nunca muda para um dado id), o cache pode ser
// público, longo e imutável. 404 quando a imagem não existe.

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  const imagem = await prisma.imagem.findUnique({
    where: { id },
    select: { dados: true, mimeType: true, tamanhoBytes: true },
  });

  if (!imagem) {
    return new Response(JSON.stringify({ erro: "nao_encontrado" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // dados é um Buffer (Bytes no Prisma). Converte para Uint8Array para o corpo
  // da Response web padrão.
  const corpo = new Uint8Array(imagem.dados);

  return new Response(corpo, {
    status: 200,
    headers: {
      "Content-Type": imagem.mimeType,
      "Content-Length": String(imagem.tamanhoBytes),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
