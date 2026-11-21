/** @type {import('next').NextConfig} */
// Headers de segurança equivalentes aos do vercel.json estático atual
// (X-Content-Type-Options e Referrer-Policy aplicados a todas as rotas).
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;
