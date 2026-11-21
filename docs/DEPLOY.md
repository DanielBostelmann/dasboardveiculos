# Deploy na Vercel com banco Neon (Postgres)

Este guia leva a dashboard do zero ao ar: criar o banco no **Neon**, publicar o
app **Next.js** na **Vercel**, configurar as variáveis de ambiente, gerar o hash
da senha do administrador, rodar as migrações e o seed dos 112 veículos, e
verificar tudo em produção.

> **Nenhum segredo fica no git.** `DATABASE_URL`, `DIRECT_URL`,
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
| `DATABASE_URL` | Conexão **pooled** do Neon, usada pelo app em runtime. | `prisma/schema.prisma` (`datasource.url`) |
| `DIRECT_URL` | Conexão **direct** (não-pooled) do Neon, usada nas migrações. | `prisma/schema.prisma` (`datasource.directUrl`) |
| `ADMIN_EMAIL` | Email do único admin. Padrão: `bostelmann@gmail.com`. | `lib/auth.ts` |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha do admin. | `lib/auth.ts` |
| `SESSION_SECRET` | Segredo para assinar o cookie de sessão (>= 32 caracteres). | `lib/auth.ts` |

## 1. Criar o banco no Neon

1. Crie uma conta em [neon.tech](https://neon.tech) e um novo **projeto**
   (escolha a região mais próxima de Porto Velho/RO, por exemplo `us-east`).
2. O Neon já cria um banco padrão (`neondb`). Você pode usá-lo ou criar outro em
   **Databases**.
3. Em **Connection Details** (ou **Connect**), copie **duas** connection
   strings. O Neon oferece a versão *pooled* e a *direct*:
   - **Pooled** (o host tem o sufixo `-pooler`, ex.:
     `ep-xxx-pooler.sa-east-1.aws.neon.tech`) → vai em **`DATABASE_URL`**.
   - **Direct** (o mesmo host **sem** o `-pooler`, ex.:
     `ep-xxx.sa-east-1.aws.neon.tech`) → vai em **`DIRECT_URL`**.
4. **Garanta `sslmode=require`** no final das duas URLs. O formato fica assim:

   ```text
   # DATABASE_URL (pooled, runtime do app)
   postgresql://USUARIO:SENHA@ep-xxx-pooler.REGIAO.aws.neon.tech/neondb?sslmode=require

   # DIRECT_URL (direct, migrações do Prisma)
   postgresql://USUARIO:SENHA@ep-xxx.REGIAO.aws.neon.tech/neondb?sslmode=require
   ```

   O app usa a **pooled** em runtime (melhor para serverless); o Prisma usa a
   **direct** para migrações. O `schema.prisma` já aponta `url = env("DATABASE_URL")`
   e `directUrl = env("DIRECT_URL")`.

> Guarde as duas strings com segurança. Elas contêm a senha do banco e **não**
> devem ser commitadas.

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
   automaticamente; o build é `prisma generate && next build`, já definido no
   `package.json`). Não é preciso configurar comando de build manualmente.
3. Em **Environment Variables** (Project Settings > Environment Variables),
   adicione as cinco variáveis. Esses valores **não ficam no git** — são colados
   só aqui:

   | Nome | Valor |
   | --- | --- |
   | `DATABASE_URL` | a connection string **pooled** do Neon (com `sslmode=require`) |
   | `DIRECT_URL` | a connection string **direct** do Neon (com `sslmode=require`) |
   | `ADMIN_EMAIL` | `bostelmann@gmail.com` |
   | `ADMIN_PASSWORD_HASH` | o hash gerado no passo 2.1 |
   | `SESSION_SECRET` | o valor aleatório do passo 2.2 |

   Marque-as para os ambientes desejados (ao menos **Production**; inclua
   **Preview** se for testar em deploys de branch).
4. Clique em **Deploy**. Ao terminar, a Vercel mostra a URL pública do projeto.

> Se você alterar alguma variável depois, faça um **redeploy** para que o novo
> valor seja aplicado.

## 4. Migrações e seed (carga inicial dos 112 veículos)

O banco começa vazio. É preciso criar as tabelas (migração) e carregar os
veículos do CSV (seed). Rode isto **uma vez** na primeira configuração, apontando
para o banco Neon. O jeito mais simples é rodar localmente com um `.env` que
contenha as mesmas `DATABASE_URL` e `DIRECT_URL` do Neon:

```bash
# na raiz do repositório, com .env preenchido (copiado de .env.example)
npm install
npm run db:migrate     # = prisma migrate deploy — cria as tabelas (usa DIRECT_URL)
npm run db:seed        # = tsx prisma/seed.ts — carrega os 112 veículos do CSV
```

- `npm run db:migrate` aplica as migrações de `prisma/migrations/` e cria as
  tabelas `veiculos` e `imagens`.
- `npm run db:seed` lê `build/fonte/veiculos.csv` e faz **upsert por placa**. É
  **idempotente**: rodar de novo apenas atualiza os registros, sem duplicar. Ao
  final imprime a contagem por modelo (VW Polo 40, VW Virtus Exclusive 9,
  VW Virtus TSI 63, total **112**).

O seed **não** cria imagens — as fotos são adicionadas depois pelo admin, pela
própria dashboard.

> Alternativa sem máquina local: rode esses dois comandos em qualquer ambiente
> com Node 22+ e as mesmas variáveis de ambiente do Neon (por exemplo um
> terminal/Codespace temporário). O essencial é que `DATABASE_URL` e `DIRECT_URL`
> apontem para o banco Neon no momento de rodar `db:migrate` e `db:seed`.

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
confira `DATABASE_URL`/`DIRECT_URL` e se o `db:migrate` + `db:seed` já foram
executados contra o banco Neon.
