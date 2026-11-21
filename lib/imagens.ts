// Lógica pura de processamento de imagens dos veículos (sem Prisma/banco).
//
// Extraída das rotas de API (FEAT-004) para poder ser testada em memória com
// sharp, sem precisar de um banco Neon. Cobre:
//   - validação de mimeType e de tamanho de entrada;
//   - compressão/redimensionamento via sharp (reorientar por EXIF, limitar o
//     maior lado, recomprimir para perto de ~1MB);
//   - a regra de limite de 5 imagens por veículo (decisão a partir de um
//     contador, para ser testada com um valor mockado).

import sharp from "sharp";

/** mimeTypes aceitos no upload de imagem. */
export const MIME_TYPES_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type MimeTypeAceito = (typeof MIME_TYPES_ACEITOS)[number];

/** Máximo de imagens por veículo (ordem 0..4). */
export const MAX_IMAGENS_POR_VEICULO = 5;

/** Tamanho máximo do arquivo de ENTRADA, antes de processar (~12MB). */
export const TAMANHO_MAXIMO_ENTRADA = 12 * 1024 * 1024;

/** Maior lado permitido na imagem final (px). */
export const DIMENSAO_MAXIMA = 1600;

/** Alvo de tamanho da imagem final após compressão (~1MB). */
export const TAMANHO_ALVO_SAIDA = 1024 * 1024;

/** Qualidade inicial de recompressão (jpeg/webp). */
const QUALIDADE_INICIAL = 80;
/** Qualidade mínima aceita ao iterar para reduzir o tamanho. */
const QUALIDADE_MINIMA = 40;

/** Resultado de uma validação: ok, ou um erro com código HTTP sugerido. */
export type ResultadoValidacao =
  | { ok: true }
  | { ok: false; status: number; erro: string };

/** Verifica se uma string é um mimeType aceito. */
export function mimeTypeAceito(mimeType: string): mimeType is MimeTypeAceito {
  return (MIME_TYPES_ACEITOS as readonly string[]).includes(mimeType);
}

/**
 * Valida o mimeType e o tamanho de entrada de um upload, ANTES de processar.
 * Retorna o status HTTP adequado em caso de falha:
 *   400 -> mimeType ausente/não aceito ou tamanho inválido;
 *   413 -> arquivo maior que o limite de entrada.
 */
export function validarEntradaImagem(
  mimeType: string | null | undefined,
  tamanhoBytes: number
): ResultadoValidacao {
  if (!mimeType || !mimeTypeAceito(mimeType)) {
    return {
      ok: false,
      status: 400,
      erro: "tipo_invalido",
    };
  }
  if (!Number.isFinite(tamanhoBytes) || tamanhoBytes <= 0) {
    return { ok: false, status: 400, erro: "arquivo_vazio" };
  }
  if (tamanhoBytes > TAMANHO_MAXIMO_ENTRADA) {
    return { ok: false, status: 413, erro: "arquivo_grande" };
  }
  return { ok: true };
}

/**
 * Decide se é possível aceitar mais uma imagem dado o número atual de imagens
 * do veículo. Pura: recebe o contador (mockável em teste) e decide, sem tocar
 * no banco. Rejeita quando já há MAX_IMAGENS_POR_VEICULO (a 6ª imagem).
 */
export function podeAceitarMaisImagem(quantidadeAtual: number): ResultadoValidacao {
  if (quantidadeAtual >= MAX_IMAGENS_POR_VEICULO) {
    return { ok: false, status: 409, erro: "limite_imagens" };
  }
  return { ok: true };
}

/** Imagem já processada, pronta para persistir. `dados` é um Uint8Array
 * respaldado por um ArrayBuffer próprio (o que o Prisma espera para Bytes). */
export interface ImagemProcessada {
  dados: Uint8Array<ArrayBuffer>;
  mimeType: MimeTypeAceito;
  tamanhoBytes: number;
  largura: number;
  altura: number;
}

/** Converte um Buffer do sharp em um Uint8Array com ArrayBuffer próprio,
 * compatível com o tipo Bytes do Prisma (Uint8Array<ArrayBuffer>). */
function paraUint8(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(buffer.length);
  const copia = new Uint8Array(ab);
  copia.set(buffer);
  return copia;
}

/**
 * Processa um buffer de imagem com sharp:
 *   - reorienta conforme o EXIF (rotaciona de acordo com a orientação da foto);
 *   - redimensiona para no máximo DIMENSAO_MAXIMA no maior lado (sem ampliar);
 *   - recomprime iterando a qualidade para ficar perto de TAMANHO_ALVO_SAIDA.
 *
 * O formato de saída preserva PNG como PNG (otimizado) e trata jpeg/webp (e
 * qualquer outro aceito) como jpeg comprimido, que casa com o alvo de ~1MB.
 * Lança um erro com a marca `imagemInvalida` se o buffer não for decodificável.
 */
export async function processarImagem(
  entrada: Buffer,
  mimeType: MimeTypeAceito
): Promise<ImagemProcessada> {
  let metadata;
  try {
    metadata = await sharp(entrada).metadata();
  } catch {
    const e = new Error("imagem_invalida") as Error & { imagemInvalida?: boolean };
    e.imagemInvalida = true;
    throw e;
  }
  if (!metadata.width || !metadata.height) {
    const e = new Error("imagem_invalida") as Error & { imagemInvalida?: boolean };
    e.imagemInvalida = true;
    throw e;
  }

  // Base comum: aplicar rotação por EXIF e limitar a dimensão. withoutEnlargement
  // evita ampliar imagens menores que o limite.
  const base = () =>
    sharp(entrada)
      .rotate()
      .resize({
        width: DIMENSAO_MAXIMA,
        height: DIMENSAO_MAXIMA,
        fit: "inside",
        withoutEnlargement: true,
      });

  if (mimeType === "image/png") {
    const buffer = await base().png({ compressionLevel: 9, palette: true }).toBuffer();
    // PNG pode não baixar de ~1MB em imagens complexas; se exceder bastante o
    // alvo, cair para jpeg garante o ~1MB mantendo compatibilidade de exibição.
    if (buffer.length > TAMANHO_ALVO_SAIDA) {
      return comprimirJpeg(base);
    }
    const info = await sharp(buffer).metadata();
    return {
      dados: paraUint8(buffer),
      mimeType: "image/png",
      tamanhoBytes: buffer.length,
      largura: info.width ?? DIMENSAO_MAXIMA,
      altura: info.height ?? DIMENSAO_MAXIMA,
    };
  }

  if (mimeType === "image/webp") {
    return comprimirWebp(base);
  }

  return comprimirJpeg(base);
}

/** Recomprime como JPEG reduzindo a qualidade até ficar perto do alvo. */
async function comprimirJpeg(
  base: () => sharp.Sharp
): Promise<ImagemProcessada> {
  let qualidade = QUALIDADE_INICIAL;
  let buffer = await base().jpeg({ quality: qualidade, mozjpeg: true }).toBuffer();
  while (buffer.length > TAMANHO_ALVO_SAIDA && qualidade > QUALIDADE_MINIMA) {
    qualidade -= 10;
    buffer = await base().jpeg({ quality: qualidade, mozjpeg: true }).toBuffer();
  }
  const info = await sharp(buffer).metadata();
  return {
    dados: paraUint8(buffer),
    mimeType: "image/jpeg",
    tamanhoBytes: buffer.length,
    largura: info.width ?? DIMENSAO_MAXIMA,
    altura: info.height ?? DIMENSAO_MAXIMA,
  };
}

/** Recomprime como WebP reduzindo a qualidade até ficar perto do alvo. */
async function comprimirWebp(
  base: () => sharp.Sharp
): Promise<ImagemProcessada> {
  let qualidade = QUALIDADE_INICIAL;
  let buffer = await base().webp({ quality: qualidade }).toBuffer();
  while (buffer.length > TAMANHO_ALVO_SAIDA && qualidade > QUALIDADE_MINIMA) {
    qualidade -= 10;
    buffer = await base().webp({ quality: qualidade }).toBuffer();
  }
  const info = await sharp(buffer).metadata();
  return {
    dados: paraUint8(buffer),
    mimeType: "image/webp",
    tamanhoBytes: buffer.length,
    largura: info.width ?? DIMENSAO_MAXIMA,
    altura: info.height ?? DIMENSAO_MAXIMA,
  };
}
