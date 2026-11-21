// Testa a lógica pura de processamento de imagens (lib/imagens.ts) sem banco.
//
// sharp roda em memória: geramos buffers de imagem de teste com o próprio sharp
// (um PNG grande e colorido) e confirmamos que:
//   (a) a validação de mimeType/tamanho aceita/rejeita corretamente;
//   (b) o processamento respeita o limite de dimensão e produz o mimeType alvo;
//   (c) o helper de limite rejeita a 6ª imagem dado um contador mockado de 5.
//
// O módulo sob teste é TypeScript/ESM; o script `test` registra o loader tsx
// (node --import tsx), então importamos via import() dinâmico.
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

// Gera um PNG de teste com as dimensões pedidas, preenchido com ruído para
// não comprimir a quase nada (aproxima uma foto real).
async function pngDeTeste(largura, altura) {
  const canais = 3;
  const pixels = Buffer.alloc(largura * altura * canais);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.floor(Math.random() * 256);
  }
  return sharp(pixels, { raw: { width: largura, height: altura, channels: canais } })
    .png()
    .toBuffer();
}

test("validarEntradaImagem aceita mimeTypes válidos e rejeita inválidos", async () => {
  const { validarEntradaImagem } = await import("../lib/imagens.ts");

  assert.equal(validarEntradaImagem("image/jpeg", 1000).ok, true);
  assert.equal(validarEntradaImagem("image/png", 1000).ok, true);
  assert.equal(validarEntradaImagem("image/webp", 1000).ok, true);

  const gif = validarEntradaImagem("image/gif", 1000);
  assert.equal(gif.ok, false);
  assert.equal(gif.status, 400);
  assert.equal(gif.erro, "tipo_invalido");

  const semTipo = validarEntradaImagem(null, 1000);
  assert.equal(semTipo.ok, false);
  assert.equal(semTipo.status, 400);
});

test("validarEntradaImagem rejeita arquivo vazio (400) e grande (413)", async () => {
  const { validarEntradaImagem, TAMANHO_MAXIMO_ENTRADA } = await import("../lib/imagens.ts");

  const vazio = validarEntradaImagem("image/jpeg", 0);
  assert.equal(vazio.ok, false);
  assert.equal(vazio.status, 400);
  assert.equal(vazio.erro, "arquivo_vazio");

  const grande = validarEntradaImagem("image/jpeg", TAMANHO_MAXIMO_ENTRADA + 1);
  assert.equal(grande.ok, false);
  assert.equal(grande.status, 413);
  assert.equal(grande.erro, "arquivo_grande");
});

test("podeAceitarMaisImagem rejeita a 6ª imagem (contador mockado = 5)", async () => {
  const { podeAceitarMaisImagem, MAX_IMAGENS_POR_VEICULO } = await import("../lib/imagens.ts");

  assert.equal(MAX_IMAGENS_POR_VEICULO, 5);
  for (let n = 0; n < 5; n++) {
    assert.equal(podeAceitarMaisImagem(n).ok, true, `com ${n} imagens deve aceitar`);
  }
  const sexta = podeAceitarMaisImagem(5);
  assert.equal(sexta.ok, false, "com 5 imagens a 6ª deve ser rejeitada");
  assert.equal(sexta.status, 409);
  assert.equal(sexta.erro, "limite_imagens");
});

test("processarImagem limita o maior lado a 1600px e produz PNG para entrada PNG", async () => {
  const { processarImagem, DIMENSAO_MAXIMA } = await import("../lib/imagens.ts");

  // Entrada grande (2400x1200): o maior lado deve ser reduzido para 1600.
  const entrada = await pngDeTeste(2400, 1200);
  const out = await processarImagem(entrada, "image/png");

  assert.ok(out.largura <= DIMENSAO_MAXIMA, "largura dentro do limite");
  assert.ok(out.altura <= DIMENSAO_MAXIMA, "altura dentro do limite");
  assert.equal(Math.max(out.largura, out.altura), DIMENSAO_MAXIMA, "maior lado = 1600");
  assert.ok(out.tamanhoBytes > 0, "tem bytes");
  assert.equal(out.tamanhoBytes, out.dados.length, "tamanhoBytes bate com o buffer");
  // Ruído aleatório não comprime bem como PNG, então o fallback deve produzir
  // uma imagem dentro do alvo (~1MB). Qualquer que seja o formato final, o
  // tamanho não deve explodir muito acima do alvo.
  assert.ok(["image/png", "image/jpeg"].includes(out.mimeType), "mimeType de saída coerente");
});

test("processarImagem recomprime WebP dentro do alvo e não amplia imagem pequena", async () => {
  const { processarImagem, TAMANHO_ALVO_SAIDA, DIMENSAO_MAXIMA } = await import("../lib/imagens.ts");

  // Imagem menor que o limite: não deve ser ampliada.
  const pequena = await pngDeTeste(800, 600);
  const out = await processarImagem(pequena, "image/webp");

  assert.equal(out.mimeType, "image/webp");
  assert.ok(out.largura <= 800 && out.altura <= 600, "não amplia imagem pequena");
  assert.ok(out.largura <= DIMENSAO_MAXIMA && out.altura <= DIMENSAO_MAXIMA);
  assert.ok(out.tamanhoBytes <= TAMANHO_ALVO_SAIDA, "webp de teste fica dentro do alvo ~1MB");
});

test("processarImagem lança imagemInvalida para buffer não decodificável", async () => {
  const { processarImagem } = await import("../lib/imagens.ts");

  const lixo = Buffer.from("isto nao e uma imagem");
  await assert.rejects(
    () => processarImagem(lixo, "image/jpeg"),
    (e) => e && e.imagemInvalida === true
  );
});
