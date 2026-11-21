// POST /api/auth/logout
// Destrói a sessão do admin (limpa o cookie assinado).

import { NextResponse } from "next/server";
import { obterSessao } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const sessao = await obterSessao();
  if (sessao) {
    sessao.destroy();
  }
  return NextResponse.json({ autenticado: false });
}
