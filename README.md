# Dashboard de veículos à venda — Porto Velho

Dashboard em um único arquivo HTML para visualizar os veículos à venda do pátio
CS Seminovos (Porto Velho, RO) e consultar por placa.

O arquivo publicado é o **`index.html`** na raiz. É autossuficiente: CSS, JavaScript,
fonte e dados ficam embutidos nele. **Não acessa a internet** — os dados são fixos,
gravados no próprio arquivo.

## Publicação na Vercel

Não há build na Vercel: o site é o `index.html` estático na raiz.

1. Importe este repositório na Vercel.
2. Em *Framework Preset*, escolha **Other**.
3. Deixe *Build Command* e *Output Directory* em branco (a raiz já serve o `index.html`).
4. Faça o deploy. A URL abre direto na dashboard.

## O que a dashboard tem

- **Geral:** total, composição por modelo, por cor, destaques e resumo FIPE × anúncio × final.
- **Modelos:** um cartão por modelo, com FIPE, valor final médio e faixa de preços.
- **Veículos:** busca por placa com autocompletar, ordenação e ficha detalhada de cada veículo.
- **Comparar:** tabela FIPE × anúncio × final por modelo e distribuição por km e por tempo de pátio.
- **Ajuste de preço:** aplica um percentual sobre o anúncio e recalcula o valor final em toda a
  tela, com botão de restaurar. A FIPE não muda.
- Exportação em CSV, impressão e tema claro/escuro.

## Atualizar os dados

Os dados ficam em `build/fonte/veiculos.csv` (separador `;`). Para gerar o `index.html` de novo:

```bash
python3 build/build.py
```

Para rodar os testes automáticos (precisa do Node e do Playwright):

```bash
PLAYWRIGHT_MODULE=/caminho/para/node_modules/playwright node build/dashboard/test.js
```

## Fonte dos dados

Relatório "SIMULADOR CS - GERENTE", pátio CS Seminovos Porto Velho (RO), 16/11/2026.
Documento de uso interno.
