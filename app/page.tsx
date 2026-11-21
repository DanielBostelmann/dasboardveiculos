// Página inicial: a dashboard de veículos servida pelo Next (substitui o
// index.html estático). Os dados vêm de GET /api/veiculos (Neon) via fetch no
// cliente dentro do componente Dashboard.
import Dashboard from "@/components/Dashboard";

export default function HomePage() {
  return <Dashboard />;
}
