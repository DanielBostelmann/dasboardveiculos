/** @type {import('next').NextConfig} */
// Headers de segurança. Mantém X-Content-Type-Options e Referrer-Policy do
// vercel.json estático antigo e adiciona a Content-Security-Policy: espelha a
// CSP restritiva do template.html original, com `img-src 'self'` (as fotos são
// servidas pela própria API em /api/imagens/[id]; a UI não usa nenhum `data:`
// URI, então `data:` seria permissão a mais sem consumidor) e
// `font-src 'self'` (a fonte NotoSans vira asset estático em /public/fonts).
// `connect-src 'self'` libera os fetch do cliente para as rotas /api.
//
// Observação: `script-src`/`style-src` mantêm 'unsafe-inline' porque o app usa
// estilos inline (atributos style) e o pequeno script de tema inline no <head>,
// exatamente como o build estático antigo fazia. O Next em dev precisa de
// 'unsafe-eval' no script-src; liberamos apenas fora de produção.
const ehProducao = process.env.NODE_ENV === "production";
const csp = [
  "default-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${ehProducao ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // sharp é usado em runtime (rotas de API) para comprimir imagens; mantê-lo
  // fora do bundle serverless empacotado pelo tracing do Next evita problemas
  // com o binário nativo.
  serverExternalPackages: ["sharp"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
