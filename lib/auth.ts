// Autenticação do único administrador da dashboard.
//
// Não há tabela de usuários: o admin é definido por variáveis de ambiente
// (ADMIN_EMAIL, ADMIN_PASSWORD_HASH) lidas de process.env e NUNCA commitadas.
// A sessão é guardada em um cookie httpOnly assinado com iron-session, usando
// SESSION_SECRET. Todas as funções falham de forma segura (negam acesso)
// quando as variáveis obrigatórias não estão configuradas.
//
// A senha em texto puro nunca é persistida nem registrada: apenas o hash
// bcrypt é comparado em memória via bcryptjs.compare.

import bcrypt from "bcryptjs";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

/** Email padrão do admin, usado se ADMIN_EMAIL não estiver definido. */
const EMAIL_PADRAO = "bostelmann@gmail.com";

/** Conteúdo guardado no cookie de sessão. */
export interface DadosSessao {
  admin?: boolean;
  email?: string;
}

/** Nome do cookie de sessão. */
export const NOME_COOKIE_SESSAO = "dashboard_veiculos_sessao";

/**
 * Lê o segredo da sessão de process.env.SESSION_SECRET.
 * Retorna null (em vez de lançar) quando ausente ou curto demais, para que as
 * rotas possam negar acesso em vez de derrubar o processo.
 */
function lerSegredoSessao(): string | null {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) {
    return null;
  }
  return segredo;
}

/** Monta as opções do iron-session, ou null se o segredo não estiver configurado. */
function opcoesSessao(): SessionOptions | null {
  const password = lerSegredoSessao();
  if (!password) {
    return null;
  }
  return {
    password,
    cookieName: NOME_COOKIE_SESSAO,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

/**
 * Obtém a sessão iron-session a partir do cookie da requisição atual
 * (App Router). Retorna null quando SESSION_SECRET não está configurado.
 */
export async function obterSessao(): Promise<IronSession<DadosSessao> | null> {
  const opcoes = opcoesSessao();
  if (!opcoes) {
    return null;
  }
  const cookieStore = await cookies();
  return getIronSession<DadosSessao>(cookieStore, opcoes);
}

/** Email do admin autorizado (ADMIN_EMAIL ou o padrão), já normalizado. */
export function emailAdmin(): string {
  return (process.env.ADMIN_EMAIL || EMAIL_PADRAO).trim().toLowerCase();
}

/**
 * Confere se o email informado é o do admin autorizado.
 * Comparação case-insensitive e tolerante a espaços nas bordas.
 */
export function emailConfere(email: string): boolean {
  if (typeof email !== "string") {
    return false;
  }
  return email.trim().toLowerCase() === emailAdmin();
}

/** Formato de um hash bcrypt: $2a$/$2b$/$2y$, custo com 2 dígitos e 53 caracteres. */
const FORMATO_HASH_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Lê ADMIN_PASSWORD_HASH tolerando o que costuma vir junto ao colar o valor
 * no painel da Vercel: espaços ou quebras de linha nas bordas e aspas em volta.
 * Retorna null quando a variável não está configurada.
 */
export function lerHashAdmin(): string | null {
  const bruto = process.env.ADMIN_PASSWORD_HASH;
  if (!bruto) {
    return null;
  }
  const limpo = bruto.trim().replace(/^["']+|["']+$/g, "").trim();
  return limpo.length > 0 ? limpo : null;
}

/**
 * Resumo da configuração de autenticação para diagnóstico em log. Não contém
 * segredos: só se cada variável existe, se o hash tem o formato bcrypt e o
 * tamanho dele (um hash bcrypt válido sempre tem 60 caracteres).
 */
export function diagnosticoAuth(): {
  hashConfigurado: boolean;
  hashFormatoValido: boolean;
  hashTamanho: number;
  hashTinhaSobras: boolean;
  sessaoConfigurada: boolean;
} {
  const bruto = process.env.ADMIN_PASSWORD_HASH ?? "";
  const hash = lerHashAdmin();
  return {
    hashConfigurado: hash !== null,
    hashFormatoValido: hash !== null && FORMATO_HASH_BCRYPT.test(hash),
    hashTamanho: hash?.length ?? 0,
    hashTinhaSobras: hash !== null && bruto !== hash,
    sessaoConfigurada: lerSegredoSessao() !== null,
  };
}

/**
 * Verifica a senha informada contra o hash bcrypt em ADMIN_PASSWORD_HASH.
 * Retorna false (negar) se o hash não estiver configurado ou se a comparação
 * falhar. Nunca lança por entrada inválida.
 */
export async function senhaConfere(senha: string): Promise<boolean> {
  const hash = lerHashAdmin();
  if (!hash || typeof senha !== "string" || senha.length === 0) {
    return false;
  }
  try {
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}

/**
 * Valida email + senha do admin. Combina emailConfere e senhaConfere.
 * Não revela qual dos dois falhou (defesa contra enumeração).
 */
export async function credenciaisConferem(email: string, senha: string): Promise<boolean> {
  const okEmail = emailConfere(email);
  // Executa a verificação de senha mesmo com email errado para reduzir a
  // diferença de tempo entre os casos (mitigação simples de timing).
  const okSenha = await senhaConfere(senha);
  return okEmail && okSenha;
}

/** Indica se a sessão fornecida representa um admin autenticado. */
export function sessaoAutenticada(sessao: DadosSessao | null): boolean {
  return Boolean(sessao && sessao.admin === true && sessao.email);
}

/**
 * Helper de proteção para rotas de escrita (ex.: upload/remoção de fotos na
 * FEAT-004). Lê a sessão atual e, se não houver admin autenticado, retorna um
 * objeto { response } com um 401 pronto para ser devolvido pela rota.
 * Em caso de sucesso, retorna { session } com os dados da sessão.
 *
 * Uso típico numa rota:
 *   const guard = await requireAdmin();
 *   if (guard.response) return guard.response;
 *   // ... segue autenticado, guard.session disponível
 */
export async function requireAdmin(): Promise<
  { response: Response; session?: undefined } | { response?: undefined; session: DadosSessao }
> {
  const sessao = await obterSessao();
  if (!sessaoAutenticada(sessao)) {
    return { response: respostaNaoAutorizado() };
  }
  return { session: { admin: true, email: sessao!.email } };
}

/** Resposta 401 padronizada, sem revelar detalhes. */
export function respostaNaoAutorizado(): Response {
  return new Response(JSON.stringify({ erro: "nao_autorizado" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
