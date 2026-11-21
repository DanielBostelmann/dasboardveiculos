# Dashboard de veículos à venda — Porto Velho

Dashboard dos veículos à venda do pátio CS Seminovos (Porto Velho, RO), com
consulta por placa, ajuste de preço e galeria de até 5 fotos por veículo.

A aplicação é um projeto **Next.js (App Router) + TypeScript** servido na Vercel.
Os dados vêm de um banco **Neon (Postgres)** via Prisma: a lista é pública
(`GET /api/veiculos`) e o administrador autenticado pode enviar e remover fotos
de cada veículo. A dashboard é servida na raiz (`/`) pelo próprio Next.

> O antigo `index.html` estático (dados fixos embutidos, sem internet) foi
> aposentado: a página inicial agora é renderizada pelo Next e alimentada pela
> API. O `build/` é mantido como referência visual histórica (CSS/JS/HTML
> originais que a UI espelha).

## O que a dashboard tem

- **Geral:** total, composição por modelo, por cor, destaques e resumo FIPE × anúncio × final.
- **Modelos:** um cartão por modelo, com FIPE, valor final médio e faixa de preços.
- **Veículos:** busca por placa com autocompletar, ordenação e ficha detalhada de cada veículo.
- **Comparar:** tabela FIPE × anúncio × final por modelo e distribuição por km e por tempo de pátio.
- **Galeria de fotos:** no detalhe do veículo, até 5 fotos servidas pela API; navegação entre elas e estado vazio quando não há fotos.
- **Administração:** login do administrador e, quando autenticado, upload de foto (inclusive tirada na hora pelo celular) e remoção por foto.
- **Ajuste de preço:** aplica um percentual sobre o anúncio e recalcula o valor final em toda a tela, com botão de restaurar. A FIPE não muda.
- Exportação em CSV, impressão e tema claro/escuro.

## Desenvolvimento

Pré-requisitos: Node 22+ e uma `DATABASE_URL` de Postgres (Neon) em `.env`
(ver `.env.example`). Nunca comite segredos.

```bash
npm install
npx prisma generate
npm run build          # prisma generate + next build
npm run dev            # servidor de desenvolvimento
```

Os dados iniciais (112 veículos do CSV) são carregados pelo seed:

```bash
npm run db:migrate     # aplica as migrações no banco
npm run db:seed        # carrega os veículos do CSV
```

## Testes

Testes de unidade/rota (runner nativo do Node):

```bash
npm test
```

Teste de UI com Playwright (roda contra `next start` com `GET /api/veiculos`
mockado a partir do CSV, sem precisar do banco):

```bash
npm run build
npx tsx test-ui/gerar-mock.ts        # gera test-ui/mock-veiculos.json
PLAYWRIGHT_BROWSERS_PATH=/caminho/para/browsers \
PLAYWRIGHT_MODULE=/caminho/para/node_modules/playwright \
node test-ui/dashboard.ui.js
```

Ele confirma o total de veículos, troca de abas sem transbordo, busca de placa
com autocomplete, o ajuste de −10% recalculando o valor final e a exportação CSV.

## Atualizar os dados

Os dados de origem ficam em `build/fonte/veiculos.csv` (separador `;`). Depois de
atualizar o CSV, rode o seed (`npm run db:seed`) para recarregar o banco.

## Publicação na Vercel

O deploy agora é um app Next.js (Framework Preset: **Next.js**, build automático).
As variáveis de ambiente (`DATABASE_URL`, `DIRECT_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD_HASH`, `SESSION_SECRET`) ficam **fora do git**, configuradas no
painel da Vercel. Os headers de segurança que antes ficavam no `vercel.json`
(X-Content-Type-Options, Referrer-Policy) agora são aplicados por
`next.config.js`, junto de uma Content-Security-Policy restritiva que libera
`img-src 'self'` para as fotos servidas pela API.

O passo a passo completo de deploy (criar o banco no Neon e copiar a connection
string, configurar as variáveis de ambiente na Vercel, gerar o hash da senha e o
`SESSION_SECRET`, rodar as migrações e o seed, e verificar em produção) está em
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Fonte dos dados

Relatório "SIMULADOR CS - GERENTE", pátio CS Seminovos Porto Velho (RO).
Documento de uso interno.
