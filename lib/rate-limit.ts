// Rate limit simples em memória, por chave (ex.: IP), para mitigar brute force
// no login. É uma janela fixa com contador por chave.
//
// LIMITAÇÃO IMPORTANTE (serverless/Vercel): o estado vive na memória do
// processo. Cada instância/lambda tem seu próprio contador e a memória é
// reiniciada a frio, então este limite NÃO é global nem durável. Serve como
// primeira barreira; proteção robusta exigiria um store compartilhado
// (ex.: Redis/Upstash), fora do escopo desta feature (admin único).

interface Registro {
  contagem: number;
  reinicioEm: number; // epoch ms em que a janela expira
}

const JANELA_MS = 60_000; // 1 minuto
const MAX_TENTATIVAS = 5; // tentativas permitidas por janela por chave

const registros = new Map<string, Registro>();

export interface ResultadoRateLimit {
  permitido: boolean;
  /** Segundos até a janela reiniciar (para enviar no header Retry-After). */
  retryAfter: number;
}

/**
 * Registra uma tentativa para `chave` e indica se ela é permitida.
 * Deve ser chamada uma vez por requisição protegida.
 */
export function registrarTentativa(
  chave: string,
  agora: number = Date.now(),
): ResultadoRateLimit {
  const atual = registros.get(chave);

  if (!atual || agora >= atual.reinicioEm) {
    registros.set(chave, { contagem: 1, reinicioEm: agora + JANELA_MS });
    return { permitido: true, retryAfter: 0 };
  }

  atual.contagem += 1;
  if (atual.contagem > MAX_TENTATIVAS) {
    return {
      permitido: false,
      retryAfter: Math.ceil((atual.reinicioEm - agora) / 1000),
    };
  }
  return { permitido: true, retryAfter: 0 };
}

/** Limpa o contador de uma chave (ex.: após login bem-sucedido). */
export function limparTentativas(chave: string): void {
  registros.delete(chave);
}

/** Apenas para testes: zera todo o estado. */
export function _resetarRateLimit(): void {
  registros.clear();
}
