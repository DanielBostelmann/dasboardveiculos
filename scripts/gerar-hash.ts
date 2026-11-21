// Gera o hash bcrypt da senha do admin para colar em ADMIN_PASSWORD_HASH
// (na Vercel: Project Settings > Environment Variables).
//
// Uso:
//   npx tsx scripts/gerar-hash.ts
//     -> pede a senha de forma interativa (stdin, SEM eco na tela)
//
//   ADMIN_PASSWORD_PLAINTEXT='sua-senha' npx tsx scripts/gerar-hash.ts
//     -> lê a senha de uma variável de ambiente temporária (útil em CI)
//
// O script NÃO grava a senha nem o hash em arquivo; imprime APENAS o hash
// no stdout. A senha em texto puro só existe em memória durante a execução.

import bcrypt from "bcryptjs";
import * as readline from "node:readline";

/** Custo do bcrypt (>= 12 por requisito de segurança). */
const CUSTO = 12;

/**
 * Lê a senha do stdin sem ecoar os caracteres digitados.
 * Resolve com a string digitada (sem o \n final).
 */
function lerSenhaSemEco(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr; // prompts vão para stderr; stdout fica só com o hash
    output.write(prompt);

    const rl = readline.createInterface({ input, output, terminal: true });

    // Silencia o eco: intercepta a escrita do readline no output.
    const rlAny = rl as unknown as { _writeToOutput?: (s: string) => void };
    rlAny._writeToOutput = (stringToWrite: string) => {
      // Permite apenas quebras de linha; esconde os caracteres da senha.
      if (stringToWrite.includes("\n")) {
        output.write("\n");
      }
    };

    rl.question("", (resposta) => {
      rl.close();
      resolve(resposta);
    });

    rl.on("error", reject);
  });
}

async function obterSenha(): Promise<string> {
  const porEnv = process.env.ADMIN_PASSWORD_PLAINTEXT;
  if (porEnv && porEnv.length > 0) {
    return porEnv;
  }
  if (!process.stdin.isTTY) {
    throw new Error(
      "Sem TTY e sem ADMIN_PASSWORD_PLAINTEXT. Rode interativamente ou defina a variável de ambiente temporária.",
    );
  }
  const senha = await lerSenhaSemEco("Senha do admin (não aparece na tela): ");
  const confirmacao = await lerSenhaSemEco("Confirme a senha: ");
  if (senha !== confirmacao) {
    throw new Error("As senhas não conferem.");
  }
  return senha;
}

async function main(): Promise<void> {
  const senha = await obterSenha();
  if (!senha || senha.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres.");
  }
  const hash = await bcrypt.hash(senha, CUSTO);
  // Única saída no stdout: o hash. Nada de senha, nada de texto extra.
  process.stdout.write(hash + "\n");
}

main().catch((erro: unknown) => {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  process.stderr.write(`Erro: ${mensagem}\n`);
  process.exit(1);
});
