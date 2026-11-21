# Deploy na Vercel com banco Neon (Postgres)

Este guia leva a dashboard do zero ao ar: criar o banco **Neon** pela própria
**Vercel**, configurar as variáveis de ambiente, gerar o hash da senha do
administrador e verificar tudo em produção. As migrações e a carga dos 112
veículos rodam sozinhas no build.

> **Nenhum segredo fica no git.** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
> `ADMIN_PASSWORD_HASH` e `SESSION_SECRET` são configurados no painel da Vercel
> (e, para rodar comandos locais, em um `.env` que não é commitado). O arquivo
> `.env.example` lista as variáveis sem valores reais.

## Visão geral da arquitetura

- **App:** Next.js (App Router) + TypeScript, servido na Vercel.
- **Banco:** Neon (Postgres) acessado via Prisma. As fotos são guardadas dentro
  do próprio banco (coluna `bytea`), sem storage externo.
- **Dashboard pública:** a lista de veículos vem de `GET /api/veiculos`.
- **Administração restrita:** apenas o administrador autenticado
  (`bostelmann@gmail.com`) envia e remove fotos (até 5 por veículo).

Variáveis de ambiente usadas pelo código:

| Variável | Para que serve | Onde é lida |
| --- | --- | --- |
| `DATABASE_URL` | Conexão **pooled** do Neon, usada pelo app em runtime. Criada pela integração Neon. | `prisma/schema.prisma` (`datasource.url`) |
| `DATABASE_URL_UNPOOLED` | Conexão **direct** (não-pooled) do Neon, usada nas migrações. Criada pela integração Neon. | `prisma/schema.prisma` (`datasource.directUrl`) |
| `ADMIN_EMAIL` | Email do único admin. Padrão: `bostelmann@gmail.com`. | `lib/auth.ts` |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha do admin. | `lib/auth.ts` |
| `SESSION_SECRET` | Segredo para assinar o cookie de sessão (>= 32 caracteres). | `lib/auth.ts` |

## 1. Criar o banco Neon pela Vercel

O time da Vercel já tem a integração **Neon** instalada (plano Free). O banco é
criado e conectado ao projeto pelo painel, sem copiar connection string:

1. No painel da Vercel, abra o projeto **dasboardveiculos** > aba **Storage** >
   **Create Database** > **Neon** (Serverless Postgres) > plano **Free**.
2. Região: **iad1 (Washington, D.C. — US East)**, a mesma das funções do
   projeto. Banco e funções na mesma região deixam as consultas rápidas.
3. Ao conectar ao projeto, marque **Production**, **Preview** e
   **Development** e deixe o prefixo das variáveis **em branco**.
4. A integração cria as variáveis de conexão no projeto. As que o app usa são
   `DATABASE_URL` (pooled, runtime) e `DATABASE_URL_UNPOOLED` (direct,
   migrações); o `schema.prisma` já aponta para as duas.

> Para rodar comandos locais contra o banco, copie as duas URLs do painel do
> Neon (ou da aba Storage) para um `.env` que **não** é commitado.

## 2. Gerar os segredos do admin

Faça isto **antes** de configurar a Vercel, de preferência na sua máquina (os
valores vão para o painel da Vercel, nunca para um arquivo versionado).

### 2.1. Hash da senha do administrador

A senha é digitada localmente e só o **hash** sai do script. Com as dependências
instaladas (`npm install`):

```bash
npx tsx scripts/gerar-hash.ts
```

O script pede a senha sem exibi-la, pede a confirmação e imprime **apenas** o
hash bcrypt (começa com `$2...`). Copie esse hash para **`ADMIN_PASSWORD_HASH`**
na Vercel. O script não grava a senha nem o hash em disco.

- A senha inicial é a que você definiu com o usuário. **Troque-a depois** e nunca
  a escreva em nenhum arquivo do repositório.
- Para automatizar (CI), o script também aceita a senha via
  `ADMIN_PASSWORD_PLAINTEXT` em uma variável temporária; prefira a digitação
  interativa sempre que possível.

### 2.2. SESSION_SECRET aleatório

Gere uma string aleatória com pelo menos 32 caracteres e use em
**`SESSION_SECRET`**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

(Alternativa equivalente: `openssl rand -base64 32`.) Se o `SESSION_SECRET`
estiver ausente ou curto demais, o app **nega** o login por segurança.

## 3. Publicar na Vercel

1. Em [vercel.com](https://vercel.com), clique em **Add New… > Project** e
   **importe** o repositório do GitHub.
2. Em **Framework Preset**, confirme **Next.js** (a Vercel detecta
   automaticamente; o build é `prisma generate && npm run db:preparar && next build`,
   já definido no `package.json`). Não é preciso configurar comando de build
   manualmente.
3. Em **Environment Variables** (Project Settings > Environment Variables),
   adicione as três variáveis do admin (as do banco já vieram da integração
   Neon, passo 1). Esses valores **não ficam no git** — são colados só aqui:

   | Nome | Valor |
   | --- | --- |
   | `ADMIN_EMAIL` | `bostelmann@gmail.com` |
   | `ADMIN_PASSWORD_HASH` | o hash gerado no passo 2.1 |
   | `SESSION_SECRET` | o valor aleatório do passo 2.2 |

   Marque-as para os ambientes desejados (ao menos **Production**; inclua
   **Preview** se for testar em deploys de branch).
4. Clique em **Deploy**. Ao terminar, a Vercel mostra a URL pública do projeto.

> Se você alterar alguma variável depois, faça um **redeploy** para que o novo
> valor seja aplicado.

## 4. Migrações e seed (carga inicial dos 112 veículos)

Não há passo manual: o build roda `npm run db:preparar`
(`scripts/preparar-banco.ts`), que

- aplica as migrações pendentes de `prisma/migrations/` (`prisma migrate deploy`,
  pela `DATABASE_URL_UNPOOLED`), criando as tabelas `veiculos` e `imagens`;
- se a tabela `veiculos` estiver **vazia**, roda o seed: lê
  `build/fonte/veiculos.csv` e carrega os 112 veículos (VW Polo 40, VW Virtus
  Exclusive 9, VW Virtus TSI 63). Com veículos já cadastrados, o seed **não**
  roda de novo.

Se `DATABASE_URL` não existir, o build de produção falha com uma mensagem
explicando que o banco não está conectado; fora da produção (build local, preview
sem banco) o passo é apenas ignorado.

O seed **não** cria imagens — as fotos são adicionadas depois pelo admin, pela
própria dashboard.

Para recarregar os veículos depois de atualizar o CSV, rode o seed manualmente
com um `.env` apontando para o Neon (é **idempotente**: upsert por placa, sem
duplicar):

```bash
npm install
npm run db:migrate     # = prisma migrate deploy (usa DATABASE_URL_UNPOOLED)
npm run db:seed        # = tsx prisma/seed.ts
```

## 5. Verificação pós-deploy

Com o deploy no ar e o banco populado, confirme o fluxo completo:

1. **Dashboard pública:** abra a URL da Vercel. A aba **Geral** deve mostrar os
   **112 veículos** e os KPIs; as abas Modelos/Veículos/Comparar funcionam, a
   busca por placa sugere resultados e o ajuste de percentual recalcula o valor
   final.
2. **Login do admin:** entre com `bostelmann@gmail.com` e a senha definida. Sem
   login, os controles de foto ficam escondidos.
3. **Enviar foto:** abra um veículo e envie uma foto. No celular, o campo permite
   **tirar a foto na hora** (câmera traseira). A foto deve aparecer na galeria.
4. **Limite de 5:** envie fotos até chegar a 5. A sexta deve ser recusada
   (erro de limite, HTTP 409).
5. **Remover foto:** remova uma das fotos e confirme que ela some da galeria.
6. **Trocar a senha inicial:** gere um novo hash (passo 2.1), atualize
   `ADMIN_PASSWORD_HASH` na Vercel e faça um redeploy.

Se o login não funcionar, verifique se `ADMIN_PASSWORD_HASH` e `SESSION_SECRET`
(>= 32 caracteres) estão corretos na Vercel. Se a dashboard não carregar dados,
confira se o banco Neon está conectado ao projeto (aba Storage) e o log do build
(linhas `[preparar-banco]`).
