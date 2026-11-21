import type { Metadata, Viewport } from "next";
import "./globals.css";

// Metadados equivalentes aos <meta> do build/dashboard/template.html.
export const metadata: Metadata = {
  title: "Dashboard — Veículos à venda · Porto Velho",
  description:
    "Dashboard de veículos à venda (CS Seminovos, Porto Velho/RO) com consulta por placa e fotos.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b2239",
  colorScheme: "light dark",
};

// Script executado antes da pintura para aplicar o tema salvo (evita flash),
// igual ao inline <script> do template estático original.
const scriptTemaInicial = `try{var t=localStorage.getItem('veic-tema');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTemaInicial }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
