import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veículos à venda — CS Seminovos",
  description:
    "Dashboard de veículos à venda (CS Seminovos, Porto Velho/RO).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
