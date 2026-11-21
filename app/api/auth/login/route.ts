// POST /api/auth/login
// Recebe { email, senha }, valida contra o admin configurado em env e, em
// sucesso, grava a sessão (cookie httpOnly assinado). Responde 401 em falha
// sem revelar qual campo errou. Aplica rate limit simples por IP.

import { NextRequest, NextResponse } from "next/server";
import { credenciaisConferem, emailAdmin, obterSessao, respostaNaoAutorizado } from "@/lib/auth";
import { limparTentativas, registrarTentativa } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Extrai um identificador de IP da requisição para o rate limit. */
function ipDaRequisicao(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // x-forwarded-for pode ter vários IPs separados por vírgula; usar o primeiro.
    return fwd.split(",")[0]!.trim();
  }
  return req.headers.get("x-real-ip") || "desconhecido";
}

export async function POST(req: NextRequest): Promise<Response> {
  const ip = ipDaRequisicao(req);
  const limite = registrarTentativa(`login:${ip}`);
  if (!limite.permitido) {
    return new NextResponse(JSON.stringify({ erro: "muitas_tentativas" }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(limite.retryAfter),
      },
    });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return respostaNaoAutorizado();
  }

  const email = typeof (corpo as any)?.email === "string" ? (corpo as any).email : "";
  const senha = typeof (corpo as any)?.senha === "string" ? (corpo as any).senha : "";

  const ok = await credenciaisConferem(email, senha);
  if (!ok) {
    return respostaNaoAutorizado();
  }

  const sessao = await obterSessao();
  if (!sessao) {
    // SESSION_SECRET não configurado: negar de forma segura.
    return respostaNaoAutorizado();
  }

  sessao.admin = true;
  sessao.email = emailAdmin();
  await sessao.save();

  // Login válido: zerar o contador de tentativas desse IP.
  limparTentativas(`login:${ip}`);

  return NextResponse.json({ autenticado: true, email: sessao.email });
}
