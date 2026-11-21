// GET /api/auth/session
// Retorna { autenticado: boolean } para a UI decidir se mostra os controles
// de administração (upload/remoção de fotos).

import { NextResponse } from "next/server";
import { obterSessao, sessaoAutenticada } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const sessao = await obterSessao();
  return NextResponse.json({ autenticado: sessaoAutenticada(sessao) });
}
