"use client";

// Componente client que reproduz o markup de build/dashboard/template.html
// (header/hero, nav de abas, filterbar, main, footer, scrim, sheet e os símbolos
// SVG inline) e, após buscar os dados de GET /api/veiculos, inicia a lógica
// portada em dashboard-core.ts. A aparência e o comportamento espelham a
// dashboard estática original; a origem dos dados agora é a API (Neon).

import { useEffect, useRef, useState } from "react";
import { iniciarDashboard, type InstanciaDashboard } from "./dashboard-core";
import type { Registro } from "./dashboard-config";

type EstadoCarga = "carregando" | "ok" | "erro";

export default function Dashboard({ registrosIniciais }: { registrosIniciais?: Registro[] }) {
  const [estado, setEstado] = useState<EstadoCarga>(registrosIniciais ? "ok" : "carregando");
  const [registros, setRegistros] = useState<Registro[] | null>(registrosIniciais ?? null);
  const instancia = useRef<InstanciaDashboard | null>(null);

  // Busca os dados no cliente quando não vieram via props (server component).
  useEffect(() => {
    if (registros) return;
    let cancelado = false;
    (async () => {
      try {
        const resp = await fetch("/api/veiculos", { headers: { accept: "application/json" } });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const dados = (await resp.json()) as Registro[];
        if (!cancelado) {
          setRegistros(dados);
          setEstado("ok");
        }
      } catch {
        if (!cancelado) setEstado("erro");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [registros]);

  // Inicia a lógica da dashboard sobre o markup já renderizado assim que os
  // dados estão disponíveis. Destrói ao desmontar para não vazar listeners.
  useEffect(() => {
    if (estado !== "ok" || !registros) return;
    instancia.current = iniciarDashboard(registros);
    return () => {
      instancia.current?.destruir();
      instancia.current = null;
    };
  }, [estado, registros]);

  if (estado === "carregando") {
    return (
      <main className="carregando-tela">
        <p className="card-note" style={{ textAlign: "center", marginTop: 48 }}>
          Carregando o estoque…
        </p>
      </main>
    );
  }

  if (estado === "erro") {
    return (
      <main className="carregando-tela">
        <section className="card" style={{ maxWidth: 480, margin: "48px auto" }}>
          <div className="empty">
            <b>Não foi possível carregar os veículos</b>
            Verifique a conexão e tente recarregar a página.
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => location.reload()}>
                Recarregar
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      {/* símbolos SVG inline, idênticos ao template.html */}
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: SIMBOLOS_SVG }}
      />
      <header className="hero">
        <div className="hero-in">
          <div className="topbar">
            <div className="brand">
              <h1>Veículos à venda · Porto Velho</h1>
              <p id="sub-loja">Estoque do pátio CS Seminovos</p>
            </div>
            <div className="top-actions">
              <button
                type="button"
                className="icon-btn"
                id="btn-admin"
                data-act="admin"
                aria-label="Administração"
                title="Administração"
                dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-tag"/></svg>` }}
              />
              <button
                type="button"
                className="icon-btn"
                id="btn-theme"
                data-act="tema"
                aria-label="Usar tema escuro"
              />
              <button
                type="button"
                className="icon-btn"
                data-act="imprimir"
                aria-label="Imprimir"
                title="Imprimir"
                dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-print"/></svg>` }}
              />
            </div>
          </div>
          <button
            type="button"
            className="status"
            id="status"
            data-act="fontes"
            data-s="fixo"
            aria-haspopup="dialog"
            dangerouslySetInnerHTML={{
              __html: `<span class="dot"></span><span id="status-txt">Dados do banco</span><svg class="ic" aria-hidden="true"><use href="#i-info"/></svg>`,
            }}
          />
          <div className="hero-main">
            <div className="hero-total">
              <div>
                <span className="big" id="h-total">
                  0
                </span>
                <span className="lbl">veículos disponíveis</span>
              </div>
              <div className="hero-ratio" id="h-ratio" />
            </div>
            <div>
              <div className="hero-split" role="img" aria-label="Composição por modelo">
                <span className="l" id="h-l" />
                <span className="p" id="h-p" />
                <span className="c" id="h-c" />
              </div>
              <div className="hero-legend" id="h-legend" />
            </div>
          </div>
          <p className="print-filters" id="print-filters" />
        </div>
      </header>
      <div className="notice" id="notice" role="status" aria-live="polite" hidden />
      <nav className="tabs" role="tablist" aria-label="Seções da dashboard">
        <button
          type="button"
          className="tab"
          role="tab"
          data-act="tab"
          data-v="geral"
          dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-grid"/></svg><span>Geral</span>` }}
        />
        <button
          type="button"
          className="tab"
          role="tab"
          data-act="tab"
          data-v="modelos"
          dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-layers"/></svg><span>Modelos</span>` }}
        />
        <button
          type="button"
          className="tab"
          role="tab"
          data-act="tab"
          data-v="veiculos"
          dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-list"/></svg><span>Veículos</span>` }}
        />
        <button
          type="button"
          className="tab"
          role="tab"
          data-act="tab"
          data-v="comparar"
          dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-scale"/></svg><span>Comparar</span>` }}
        />
      </nav>
      <div className="filterbar">
        <button
          type="button"
          className="filter-btn"
          data-act="filtros"
          aria-haspopup="dialog"
          dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-filter"/></svg>Filtros <span class="badge" id="f-count"></span>` }}
        />
        <div className="chips-row" id="chips" aria-live="polite" />
      </div>
      <main id="main" tabIndex={-1}>
        <div className="kpis" id="kpis" aria-live="polite" />
        <div className="view" id="view" style={{ marginTop: 12 }} />
      </main>
      <footer id="footer" />
      <div className="scrim" id="scrim" hidden />
      <section
        className="sheet"
        id="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        hidden
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <h2 id="sheet-title" />
            <p id="sheet-sub" />
          </div>
          <button
            type="button"
            className="sheet-close"
            id="sheet-close"
            aria-label="Fechar"
            dangerouslySetInnerHTML={{ __html: `<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>` }}
          />
        </div>
        <div className="sheet-body" id="sheet-body" />
        <div className="sheet-foot" id="sheet-foot" />
      </section>
    </>
  );
}

// Conteúdo do bloco <svg> de símbolos do template.html (ícones reutilizados via
// <use href="#i-...">). Mantido idêntico ao original.
const SIMBOLOS_SVG = `
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></symbol>
  <symbol id="i-car" viewBox="0 0 24 24"><path d="M3 13l2-6h14l2 6v4h-2M5 17H3v-4M9.5 17h5M3 13h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/></symbol>
  <symbol id="i-list" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></symbol>
  <symbol id="i-scale" viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8"/></symbol>
  <symbol id="i-filter" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
  <symbol id="i-print" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></symbol>
  <symbol id="i-database" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z"/><circle cx="7.5" cy="7.5" r="1.5"/></symbol>
  <symbol id="i-gauge" viewBox="0 0 24 24"><path d="M12 14a8 8 0 1 0-8-8"/><path d="M12 14l4-4"/></symbol>
`;
