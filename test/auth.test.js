// Testa a lógica de autenticação do admin (lib/auth.ts) sem servidor e sem banco.
//
// SEGURANÇA: este teste NUNCA usa a senha real do admin. Ele gera um hash
// bcrypt de uma senha fictícia em runtime, injeta esse hash em
// process.env.ADMIN_PASSWORD_HASH e confere que a verificação aceita a senha
// certa e rejeita a errada. requireAdmin é testado sem sessão (deve negar 401).
//
// O módulo sob teste é TypeScript/ESM; o script `test` registra o loader tsx
// (node --import tsx), então importamos via import() dinâmico.
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

// Senha fictícia, gerada/definida apenas no teste. NÃO é a senha real.
const SENHA_TESTE = "senha-ficticia-de-teste-" + Math.random().toString(36).slice(2);
const SENHA_ERRADA = SENHA_TESTE + "-errada";
const EMAIL_TESTE = "admin-teste@example.com";

test("senhaConfere aceita a senha certa e rejeita a errada", async () => {
  const { senhaConfere } = await import("../lib/auth.ts");

  const hash = await bcrypt.hash(SENHA_TESTE, 12);
  process.env.ADMIN_PASSWORD_HASH = hash;

  assert.equal(await senhaConfere(SENHA_TESTE), true, "senha certa deve ser aceita");
  assert.equal(await senhaConfere(SENHA_ERRADA), false, "senha errada deve ser rejeitada");
  assert.equal(await senhaConfere(""), false, "senha vazia deve ser rejeitada");
});

test("senhaConfere aceita hash colado com espaços, quebra de linha ou aspas", async () => {
  const { senhaConfere, diagnosticoAuth } = await import("../lib/auth.ts");
  const hash = await bcrypt.hash(SENHA_TESTE, 12);
  const salvo = process.env.ADMIN_PASSWORD_HASH;
  try {
    for (const colado of [` ${hash} `, `${hash}\n`, `"${hash}"`, `'${hash}'\r\n`]) {
      process.env.ADMIN_PASSWORD_HASH = colado;
      assert.equal(await senhaConfere(SENHA_TESTE), true, `deve aceitar ${JSON.stringify(colado)}`);
      assert.equal(await senhaConfere(SENHA_ERRADA), false);
      const diag = diagnosticoAuth();
      assert.equal(diag.hashFormatoValido, true);
      assert.equal(diag.hashTamanho, 60);
      assert.equal(diag.hashTinhaSobras, true);
    }

    process.env.ADMIN_PASSWORD_HASH = hash;
    assert.equal(diagnosticoAuth().hashTinhaSobras, false);

    process.env.ADMIN_PASSWORD_HASH = hash.slice(0, 40);
    assert.equal(await senhaConfere(SENHA_TESTE), false, "hash cortado deve negar");
    assert.equal(diagnosticoAuth().hashFormatoValido, false);
  } finally {
    if (salvo !== undefined) process.env.ADMIN_PASSWORD_HASH = salvo;
    else delete process.env.ADMIN_PASSWORD_HASH;
  }
});

test("senhaConfere nega quando ADMIN_PASSWORD_HASH não está configurado", async () => {
  const { senhaConfere } = await import("../lib/auth.ts");
  const salvo = process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_PASSWORD_HASH;
  try {
    assert.equal(await senhaConfere(SENHA_TESTE), false);
  } finally {
    if (salvo !== undefined) process.env.ADMIN_PASSWORD_HASH = salvo;
  }
});

test("emailConfere compara contra ADMIN_EMAIL (case-insensitive, aparado)", async () => {
  const { emailConfere } = await import("../lib/auth.ts");
  const salvo = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = EMAIL_TESTE;
  try {
    assert.equal(emailConfere(EMAIL_TESTE), true);
    assert.equal(emailConfere("  Admin-Teste@Example.com  "), true, "deve ignorar caixa e espaços");
    assert.equal(emailConfere("outro@example.com"), false);
    assert.equal(emailConfere(""), false);
  } finally {
    if (salvo !== undefined) process.env.ADMIN_EMAIL = salvo;
    else delete process.env.ADMIN_EMAIL;
  }
});

test("credenciaisConferem exige email E senha corretos", async () => {
  const { credenciaisConferem } = await import("../lib/auth.ts");
  const salvoEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = EMAIL_TESTE;
  process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(SENHA_TESTE, 12);
  try {
    assert.equal(await credenciaisConferem(EMAIL_TESTE, SENHA_TESTE), true);
    assert.equal(await credenciaisConferem(EMAIL_TESTE, SENHA_ERRADA), false, "senha errada falha");
    assert.equal(await credenciaisConferem("outro@example.com", SENHA_TESTE), false, "email errado falha");
  } finally {
    if (salvoEmail !== undefined) process.env.ADMIN_EMAIL = salvoEmail;
    else delete process.env.ADMIN_EMAIL;
  }
});

test("sessaoAutenticada só é verdadeira com admin=true e email presente", async () => {
  const { sessaoAutenticada } = await import("../lib/auth.ts");
  assert.equal(sessaoAutenticada(null), false);
  assert.equal(sessaoAutenticada({}), false);
  assert.equal(sessaoAutenticada({ admin: false, email: EMAIL_TESTE }), false);
  assert.equal(sessaoAutenticada({ admin: true }), false, "sem email não autentica");
  assert.equal(sessaoAutenticada({ admin: true, email: EMAIL_TESTE }), true);
});

test("requireAdmin nega (401) quando não há sessão válida", async () => {
  const { requireAdmin } = await import("../lib/auth.ts");
  // Sem SESSION_SECRET, obterSessao retorna null e requireAdmin deve negar
  // sem precisar de contexto de requisição (cookies()).
  const salvo = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    const resultado = await requireAdmin();
    assert.ok(resultado.response, "deve retornar uma resposta de negação");
    assert.equal(resultado.response.status, 401);
    assert.equal(resultado.session, undefined);
    const corpo = await resultado.response.json();
    assert.equal(corpo.erro, "nao_autorizado");
  } finally {
    if (salvo !== undefined) process.env.SESSION_SECRET = salvo;
  }
});

test("rate limit em memória bloqueia após exceder o máximo por chave", async () => {
  const { registrarTentativa, limparTentativas, _resetarRateLimit } = await import("../lib/rate-limit.ts");
  _resetarRateLimit();
  const chave = "teste:ip";
  // 5 tentativas permitidas na janela; a 6ª é bloqueada.
  for (let i = 0; i < 5; i++) {
    assert.equal(registrarTentativa(chave).permitido, true, `tentativa ${i + 1} permitida`);
  }
  const bloqueada = registrarTentativa(chave);
  assert.equal(bloqueada.permitido, false, "6ª tentativa bloqueada");
  assert.ok(bloqueada.retryAfter > 0, "retryAfter deve ser positivo quando bloqueado");

  // Após limpar, volta a permitir.
  limparTentativas(chave);
  assert.equal(registrarTentativa(chave).permitido, true, "após limpar, permite de novo");
});
