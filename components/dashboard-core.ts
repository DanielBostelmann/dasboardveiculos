// Lógica da dashboard portada de build/dashboard/app.js (fonte visual
// autoritativa) para TypeScript. O comportamento observável é preservado: abas
// Geral/Modelos/Veículos/Comparar, busca de placa com autocomplete, ajuste de
// percentual com restaurar, exportação CSV, painel deslizante, tema persistido
// em localStorage e a global window.__DASH__ usada pelos testes de UI.
//
// Diferenças em relação ao app.js original:
//  - A origem dos dados é GET /api/veiculos (passado como `registros`), não mais
//    CFG.registros embutido.
//  - O painel de detalhe do veículo (painelVeic) agora busca
//    GET /api/veiculos/[placa], exibe a galeria de até 5 fotos via
//    <img src=/api/imagens/[id]> e, para o admin logado, mostra os controles de
//    upload (com captura de foto) e remoção.
//  - O aviso/rodapé refletem dados vindos do banco (não "arquivo fixo").

import { CONFIG, type ConfigDashboard, type Registro } from "./dashboard-config";

type EstadoSessao = { autenticado: boolean };

interface ImagemMeta {
  id: string;
  ordem: number;
  mimeType: string;
  largura: number;
  altura: number;
  tamanhoBytes: number;
}

export interface InstanciaDashboard {
  destruir(): void;
}

export function iniciarDashboard(
  registrosIniciais: Registro[],
  config: ConfigDashboard = CONFIG
): InstanciaDashboard {
  /* ===================== utilidades ===================== */
  const CFG = config;
  const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
    r.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
    [...r.querySelectorAll<T>(s)];
  const reduz = matchMedia("(prefers-reduced-motion: reduce)");
  const esc = (v: unknown) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }) as Record<
          string,
          string
        >)[c]!
    );
  const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("pt-BR");
  const pct = (a: number, b: number, d = 1) =>
    b ? ((a / b) * 100).toFixed(d).replace(".", ",") + "%" : "–";
  const dec1 = (n: unknown) => Number(n).toFixed(1).replace(".", ",");
  const moeda = (n: unknown) => "R$ " + (Math.round(Number(n) || 0)).toLocaleString("pt-BR");
  const moedaK = (n: unknown) =>
    "R$ " + (Number(n) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
  const ic = (n: string) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const sem = (s: unknown) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const busca = (s: unknown) => sem(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const plural = (n: number, um: string, varios: string) =>
    `${fmt(n)} ${Math.round(n) === 1 ? um : varios}`;
  const nVe = (n: number) => plural(n, "veículo", "veículos");

  /* ===================== dados ===================== */
  const REG = registrosIniciais.map((r, i) => ({ ...r, i }));
  const COR_HEX = CFG.coresHex || {};
  const MODELOS = [...new Set(REG.map((r) => r.modelo))];
  const COR_PALETA = ["#1f4f78", "#2078a8", "#08a39a", "#f5a20b", "#c2410c", "#7fb3d5"];
  const corModelo = (m: string) => COR_PALETA[MODELOS.indexOf(m) % COR_PALETA.length];
  const faixaKm = (v: number) =>
    v < 30000 ? "Até 30 mil" : v < 60000 ? "30 a 60 mil" : v < 90000 ? "60 a 90 mil" : "Acima de 90 mil";
  const FAIXAS_KM = ["Até 30 mil", "30 a 60 mil", "60 a 90 mil", "Acima de 90 mil"];
  const faixaDias = (d: number) =>
    d <= 20 ? "Até 20 dias" : d <= 40 ? "21 a 40 dias" : d <= 60 ? "41 a 60 dias" : "Mais de 60 dias";
  const FAIXAS_DIAS = ["Até 20 dias", "21 a 40 dias", "41 a 60 dias", "Mais de 60 dias"];

  type Reg = (typeof REG)[number];

  /* preço final = anúncio ajustado pelo delta do usuário (em pontos percentuais
     sobre o anúncio). ajuste 0 = preço de anúncio original. */
  let AJUSTE = 0;
  const precoFinal = (r: Reg) => Math.round(r.anuncio * (1 + AJUSTE / 100));
  const difFipe = (r: Reg) => ((precoFinal(r) - r.fipe) / r.fipe) * 100;

  /* ===================== filtros ===================== */
  const MULTI = ["modelo", "cor", "faixaKm", "faixaDias"] as const;
  type ChaveFiltro = (typeof MULTI)[number];
  const F_LABEL: Record<ChaveFiltro, string> = {
    modelo: "Modelo",
    cor: "Cor",
    faixaKm: "Quilometragem",
    faixaDias: "Tempo de estoque",
  };
  const S: {
    f: Record<ChaveFiltro, Set<string>>;
    tab: string;
    vq: string;
    vs: string;
    avisoFechado: boolean;
  } = { f: {} as Record<ChaveFiltro, Set<string>>, tab: "geral", vq: "", vs: "dias", avisoFechado: false };
  MULTI.forEach((k) => {
    S.f[k] = new Set();
  });
  const valor = (r: Reg, k: ChaveFiltro) =>
    ({ modelo: r.modelo, cor: r.cor, faixaKm: faixaKm(r.km), faixaDias: faixaDias(r.dias) })[k];
  function passa(r: Reg, ignora?: ChaveFiltro) {
    for (const k of MULTI) {
      if (k === ignora || !S.f[k].size) continue;
      if (!S.f[k].has(String(valor(r, k)))) return false;
    }
    if (S.vq) {
      const q = busca(S.vq);
      if (q && !busca(r.placa).includes(q)) return false;
    }
    return true;
  }
  const filtrados = () => REG.filter((r) => passa(r));
  const nAtivos = () => (S.vq ? 1 : 0) + MULTI.reduce((a, k) => a + S.f[k].size, 0);
  const rotF = (_k: ChaveFiltro, v: string) => v;

  /* ===================== agregação e peças ===================== */
  interface Agregado {
    k: string;
    n: number;
    anuncio: number;
    fipe: number;
    final: number;
    km: number;
  }
  function agg(rs: Reg[], fn: (r: Reg) => string | number | null | undefined): Agregado[] {
    const m = new Map<string, Agregado>();
    for (const r of rs) {
      const k = fn(r);
      if (k == null || k === "") continue;
      const o = m.get(String(k)) || { k: String(k), n: 0, anuncio: 0, fipe: 0, final: 0, km: 0 };
      o.n++;
      o.anuncio += r.anuncio;
      o.fipe += r.fipe;
      o.final += precoFinal(r);
      o.km += r.km;
      m.set(String(k), o);
    }
    return [...m.values()];
  }
  const porN = (a: Agregado, b: Agregado) =>
    b.n - a.n || a.k.localeCompare(b.k, "pt-BR", { numeric: true });
  let ci = 0;
  function card(
    kicker: string,
    tit: string,
    corpo: string,
    o: { cls?: string; own?: boolean; nota?: string } = {}
  ) {
    return (
      `<section class="card ${o.cls || ""}" style="--i:${ci++}"><div class="kicker${o.own ? " own" : ""}">${esc(kicker)}</div>` +
      `<h2>${esc(tit)}</h2>${o.nota ? `<p class="card-note">${o.nota}</p>` : ""}${corpo}</section>`
    );
  }
  const vazio = (t: string, d: string) =>
    `<section class="card span-2"><div class="empty"><b>${esc(t)}</b>${esc(d)}` +
    `<div style="margin-top:14px"><button type="button" class="btn" data-act="limpar">${ic("x")} Limpar filtros</button></div></div></section>`;
  interface OpcoesBarras {
    valor?: (x: Agregado) => number;
    max?: number;
    tom?: string;
    ativos?: Set<string>;
    rot?: (x: Agregado) => string;
    fmtV?: (v: number) => string;
    total?: number;
    act?: string;
  }
  function barras(itens: Agregado[], o: OpcoesBarras = {}) {
    const val = o.valor || ((x: Agregado) => x.n),
      mx = o.max || Math.max(1, ...itens.map(val));
    return (
      `<div class="bars ${o.tom || ""}">` +
      itens
        .map((x) => {
          const v = val(x),
            on = !!(o.ativos && o.ativos.has(x.k));
          const dentro =
            `<span class="bar-label">${o.rot ? o.rot(x) : esc(x.k)}</span><span class="bar-track"><span class="bar-fill" data-w="${((v / mx) * 100).toFixed(2)}"></span></span>` +
            `<span class="bar-val"><b>${o.fmtV ? o.fmtV(v) : fmt(v)}</b>${o.total ? `<small>${pct(v, o.total)}</small>` : ""}</span>`;
          return o.act
            ? `<button type="button" class="bar${on ? " is-active" : ""}" data-act="${o.act}" data-v="${esc(x.k)}" aria-pressed="${on}">${dentro}</button>`
            : `<div class="bar">${dentro}</div>`;
        })
        .join("") +
      "</div>"
    );
  }
  function animar(root: ParentNode) {
    const go = () => {
      $$<HTMLElement>("[data-w]", root).forEach((e) => {
        e.style.width = e.dataset.w + "%";
      });
      $$<HTMLElement>("[data-da]", root).forEach((e) => {
        (e.style as unknown as { strokeDasharray: string }).strokeDasharray = e.dataset.da!;
      });
    };
    if (reduz.matches) go();
    else requestAnimationFrame(() => requestAnimationFrame(go));
  }
  function contar(el: HTMLElement | null, para: number, f: (n: number) => string = fmt) {
    if (!el) return;
    const elx = el as HTMLElement & { _raf?: number };
    const de = Number(el.dataset.v || 0);
    el.dataset.v = String(para);
    cancelAnimationFrame(elx._raf as number);
    if (!Number.isFinite(para)) {
      el.textContent = "–";
      el.dataset.v = "0";
      return;
    }
    if (reduz.matches || de === para) {
      el.textContent = f(para);
      return;
    }
    const t0 = performance.now(),
      dur = 600;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur),
        e = 1 - Math.pow(1 - k, 3);
      el.textContent = f(de + (para - de) * e);
      if (k < 1) elx._raf = requestAnimationFrame(passo);
    };
    elx._raf = requestAnimationFrame(passo);
  }
  const selo = (cor: string) =>
    `<span class="cor-dot" style="background:${COR_HEX[cor] || "#8b97a5"}"></span>`;
  const difTag = (d: number) => {
    const cls = d < 0 ? "neg" : d > 0 ? "pos" : "zero";
    const s = d > 0 ? "+" : "";
    return `<span class="dif ${cls}">${s}${dec1(d)}%</span>`;
  };

  /* ===================== barra de ajuste de preço ===================== */
  function painelAjuste() {
    const rs = filtrados(),
      anun = rs.reduce((a, r) => a + r.anuncio, 0),
      fin = rs.reduce((a, r) => a + precoFinal(r), 0);
    const sinal = AJUSTE > 0 ? "+" : "";
    return (
      `<div class="ajuste">` +
      `<div class="ajuste-top"><div><b>Ajuste de preço</b><span>aplica um percentual sobre o anúncio e mostra o valor final</span></div>` +
      `<div class="ajuste-val"><b class="${AJUSTE < 0 ? "neg" : AJUSTE > 0 ? "pos" : ""}">${sinal}${dec1(AJUSTE)}%</b></div></div>` +
      `<input id="ajuste-range" class="range" type="range" min="-30" max="30" step="0.5" value="${AJUSTE}" aria-label="Ajuste percentual sobre o anúncio">` +
      `<div class="ajuste-row">` +
      `<label class="ajuste-in"><span>%</span><input id="ajuste-num" type="number" inputmode="decimal" step="0.5" min="-90" max="200" value="${dec1(AJUSTE)}"></label>` +
      `<button type="button" class="btn" data-act="ajuste-reset"${AJUSTE === 0 ? " disabled" : ""}>${ic("refresh")} Restaurar</button>` +
      `</div>` +
      `<div class="ajuste-tot"><div><span>Anúncio (soma)</span><b>${moeda(anun)}</b></div><div><span>Valor final (soma)</span><b class="${fin < anun ? "neg" : fin > anun ? "pos" : ""}">${moeda(fin)}</b></div></div>` +
      (AJUSTE !== 0
        ? `<p class="card-note" style="margin:8px 0 0">O valor final e a diferença sobre a FIPE em toda a dashboard usam este ajuste. A FIPE não muda.</p>`
        : "") +
      `</div>`
    );
  }

  /* ===================== aba: geral ===================== */
  function vGeral(rec: Reg[]) {
    if (!rec.length) return vazio("Nenhum veículo com esses filtros", "Remova algum filtro para ver os dados.");
    const n = rec.length,
      anun = rec.reduce((a, r) => a + r.anuncio, 0),
      fin = rec.reduce((a, r) => a + precoFinal(r), 0),
      fipe = rec.reduce((a, r) => a + r.fipe, 0);
    const difMed = ((fin - fipe) / fipe) * 100;
    const mods = agg(rec, (r) => r.modelo).sort(porN),
      t = n;
    const C = 2 * Math.PI * 52;
    let off = 0;
    const segs = mods
      .map((m) => {
        const len = (m.n / t) * C,
          s = `<circle class="seg" cx="66" cy="66" r="52" style="stroke:${corModelo(m.k)};stroke-dasharray:0 ${C};stroke-dashoffset:${-off}" data-da="${len} ${C}"/>`;
        off += len;
        return s;
      })
      .join("");
    const rosca =
      `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 132 132" role="img" aria-label="Veículos por modelo">` +
      `<circle class="bg" cx="66" cy="66" r="52"/>${segs}</svg><div class="donut-c"><b>${fmt(t)}</b><span>veículos</span></div></div><div class="dl">` +
      mods
        .map(
          (m) =>
            `<div class="dl-row"><i style="background:${corModelo(m.k)}"></i><span>${esc(m.k)}<small>${pct(m.n, t)}</small></span><b>${fmt(m.n)}</b></div>`
        )
        .join("") +
      `</div></div>`;
    const cores = agg(rec, (r) => r.cor).sort(porN);
    const corBars =
      `<div class="bars">` +
      cores
        .map((c) => {
          const on = S.f.cor.has(c.k);
          return (
            `<button type="button" class="bar${on ? " is-active" : ""}" data-act="cor" data-v="${esc(c.k)}" aria-pressed="${on}">` +
            `<span class="bar-label">${selo(c.k)}${esc(c.k)}</span><span class="bar-track"><span class="bar-fill" style="background:${COR_HEX[c.k] || "var(--navy-tone)"}" data-w="${((c.n / cores[0].n) * 100).toFixed(2)}"></span></span>` +
            `<span class="bar-val"><b>${fmt(c.n)}</b><small>${pct(c.n, t)}</small></span></button>`
          );
        })
        .join("") +
      `</div>`;
    return (
      `<div class="grid">` +
      card("Preço", "Ajuste de valor", painelAjuste(), { cls: "span-2" }) +
      card("Composição", "Veículos por modelo", rosca, {
        nota: "Toque em um modelo na aba Modelos para ver o detalhe.",
      }) +
      card("Cores", "Veículos por cor", corBars, { nota: "Toque em uma cor para filtrar." }) +
      card("Destaques", "O que os dados mostram", destaques(rec), {}) +
      card("Preços", "FIPE x anúncio x final", resumoPreco(rec, { anun, fin, fipe, difMed }), {
        nota: "Somas do estoque filtrado.",
      }) +
      `</div>`
    );
  }
  function resumoPreco(
    rec: Reg[],
    t: { anun: number; fin: number; fipe: number; difMed: number }
  ) {
    const descFipe = rec.reduce((a, r) => a + (r.fipe - precoFinal(r)), 0);
    return (
      `<div class="mini tres"><div class="dark"><b>${moedaK(t.fipe)}</b><span>soma FIPE</span></div>` +
      `<div><b>${moedaK(t.anun)}</b><span>soma anúncio</span></div>` +
      `<div><b class="${t.fin < t.anun ? "tp" : ""}">${moedaK(t.fin)}</b><span>soma valor final</span></div></div>` +
      `<div class="mini two" style="margin-top:8px"><div><b>${difTag(t.difMed)}</b><span>final x FIPE (média ponderada)</span></div>` +
      `<div><b>${moedaK(descFipe)}</b><span>abaixo da FIPE no total</span></div></div>`
    );
  }
  function destaques(rec: Reg[]) {
    const item = (n: string, cls: string, txt: string) =>
      `<li><span class="n ${cls}">${n}</span><p>${txt}</p></li>`;
    const mods = agg(rec, (r) => r.modelo).sort(porN),
      top = mods[0];
    const barato = rec.slice().sort((a, b) => precoFinal(a) - precoFinal(b))[0];
    const menorKm = rec.slice().sort((a, b) => a.km - b.km)[0];
    const maiorDesc = rec.slice().sort((a, b) => difFipe(a) - difFipe(b))[0];
    const antigo = rec.slice().sort((a, b) => b.dias - a.dias)[0];
    return (
      `<ul class="insights">` +
      (top ? item(fmt(top.n), "l", `<b>${esc(top.k)}</b> é o modelo com mais unidades: ${nVe(top.n)}.`) : "") +
      (barato
        ? item(
            moedaK(precoFinal(barato)),
            "p",
            `menor valor final: <b>${esc(barato.placa)}</b> (${esc(barato.modelo)}, ${esc(barato.cor)}).`
          )
        : "") +
      (maiorDesc
        ? item(
            dec1(difFipe(maiorDesc)) + "%",
            "p",
            `maior desconto sobre a FIPE: <b>${esc(maiorDesc.placa)}</b>, ${moedaK(precoFinal(maiorDesc))} ante ${moedaK(maiorDesc.fipe)} de FIPE.`
          )
        : "") +
      (menorKm ? item(fmt(menorKm.km) + " km", "", `menor rodagem: <b>${esc(menorKm.placa)}</b> (${esc(menorKm.modelo)}).`) : "") +
      (antigo ? item(antigo.dias + "d", "", `mais tempo em estoque: <b>${esc(antigo.placa)}</b>, ${antigo.dias} dias no pátio.`) : "") +
      `</ul>`
    );
  }

  /* ===================== aba: modelos ===================== */
  function vModelos(rec: Reg[]) {
    const mods = agg(rec, (r) => r.modelo).sort(porN);
    if (!mods.length) return vazio("Nenhum veículo com esses filtros", "Remova algum filtro para ver os dados.");
    return (
      `<div class="grid">` +
      card("Preço", "Ajuste de valor", painelAjuste(), { cls: "span-2" }) +
      mods
        .map((m) => {
          const rs = rec.filter((r) => r.modelo === m.k),
            fipe = rs[0].fipe;
          const fin = rs.reduce((a, r) => a + precoFinal(r), 0),
            anun = rs.reduce((a, r) => a + r.anuncio, 0);
          void anun;
          const minF = Math.min(...rs.map(precoFinal)),
            maxF = Math.max(...rs.map(precoFinal)),
            medF = Math.round(fin / rs.length);
          const cores = agg(rs, (r) => r.cor).sort(porN);
          const on = S.f.modelo.has(m.k);
          const corpo =
            `<div class="cal-big"><b>${fmt(m.n)}</b><span>unidades</span></div>` +
            `<div class="mini tres" style="margin-top:10px"><div class="dark"><b>${moedaK(fipe)}</b><span>FIPE (tabela)</span></div>` +
            `<div><b>${moedaK(medF)}</b><span>valor final médio</span></div><div><b>${difTag(((medF - fipe) / fipe) * 100)}</b><span>final x FIPE</span></div></div>` +
            `<div class="legend" style="margin-top:10px"><span>Final: <b>${moeda(minF)}</b> a <b>${moeda(maxF)}</b></span><span>Soma final: <b>${moedaK(fin)}</b></span></div>` +
            `<h3>Cores</h3><div class="f-chips">${cores
              .map(
                (c) =>
                  `<button type="button" class="f-chip" data-act="cor" data-v="${esc(c.k)}" aria-pressed="${S.f.cor.has(c.k)}">${selo(c.k)}${esc(c.k)}<small>${fmt(c.n)}</small></button>`
              )
              .join("")}</div>` +
            `<button type="button" class="link-btn" data-act="modelo" data-v="${esc(m.k)}" aria-pressed="${on}">${on ? "Remover filtro deste modelo" : "Filtrar este modelo"}</button>` +
            ` · <button type="button" class="link-btn" data-act="ver-modelo" data-v="${esc(m.k)}" style="display:inline">Ver os ${m.n} veículos</button>`;
          return card("Modelo", m.k, corpo, { nota: esc(rs[0].versao) });
        })
        .join("") +
      `</div>`
    );
  }

  /* ===================== aba: veículos (lista + busca por placa) ===================== */
  const ORDENS: [string, string][] = [
    ["dias", "Mais tempo em estoque"],
    ["dias-", "Menos tempo em estoque"],
    ["final", "Menor valor final"],
    ["final-", "Maior valor final"],
    ["km", "Menor km"],
    ["km-", "Maior km"],
    ["placa", "Placa (A–Z)"],
  ];
  function vVeiculos() {
    return (
      `<div class="grid"><section class="card span-2" style="--i:0"><div class="kicker">Consulta</div><h2>Buscar por placa</h2>` +
      `<div class="toolbar"><div class="search-wrap"><label class="search"><span class="sr-only">Buscar placa</span>${ic("search")}` +
      `<input id="v-busca" type="search" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Digite a placa (ex.: RSU7B01)" value="${esc(S.vq)}" aria-expanded="false" aria-controls="v-sug" role="combobox">` +
      (S.vq ? `<button type="button" class="in-clear" data-act="placa-clear" aria-label="Limpar busca">${ic("x")}</button>` : "") +
      `</label><div id="v-sug" class="sug" role="listbox" hidden></div></div>` +
      `<label><span class="sr-only">Ordenar</span><select class="sel" id="v-ordem">${ORDENS.map(([v, t]) => `<option value="${v}"${S.vs === v ? " selected" : ""}>${t}</option>`).join("")}</select></label></div>` +
      `<p class="card-note" style="margin:10px 0 0">A busca sugere placas enquanto você digita. Toque em uma sugestão ou num cartão para ver todos os dados do veículo.</p></section>` +
      `<div class="span-2" id="v-area"></div></div>`
    );
  }
  function veicVisiveis() {
    const rs = filtrados();
    const ord =
      (
        {
          dias: (a: Reg, b: Reg) => b.dias - a.dias || a.km - b.km,
          "dias-": (a: Reg, b: Reg) => a.dias - b.dias,
          final: (a: Reg, b: Reg) => precoFinal(a) - precoFinal(b),
          "final-": (a: Reg, b: Reg) => precoFinal(b) - precoFinal(a),
          km: (a: Reg, b: Reg) => a.km - b.km,
          "km-": (a: Reg, b: Reg) => b.km - a.km,
          placa: (a: Reg, b: Reg) => a.placa.localeCompare(b.placa),
        } as Record<string, (a: Reg, b: Reg) => number>
      )[S.vs] || ((a: Reg, b: Reg) => b.dias - a.dias);
    return rs.sort(ord);
  }
  function cardVeic(r: Reg, i: number) {
    const d = difFipe(r);
    const selosFoto =
      r.nImagens && r.nImagens > 0
        ? `<span class="veic-fotos" title="${r.nImagens} foto(s)">${ic("car")}${r.nImagens}</span>`
        : "";
    return (
      `<button type="button" class="veic" style="--i:${Math.min(i, 18)}" data-act="veic-det" data-v="${esc(r.placa)}">` +
      `<span class="veic-head"><span class="placa">${esc(r.placa)}</span>${selo(r.cor)}<span class="veic-cor">${esc(r.cor)}</span>${selosFoto}</span>` +
      `<span class="veic-mod">${esc(r.modelo)}</span>` +
      `<span class="veic-meta"><span>${fmt(r.km)} km</span><span>${r.dias} dias</span></span>` +
      `<span class="veic-preco"><b>${moeda(precoFinal(r))}</b>${difTag(d)}</span></button>`
    );
  }
  function listaVeiculos() {
    const area = $("#v-area");
    if (!area) return;
    const rs = veicVisiveis();
    area.innerHTML =
      `<div class="count-line"><span>${nVe(rs.length)}${S.vq ? ' · busca “' + esc(S.vq) + '”' : ""}</span>` +
      `<button type="button" class="btn ghost" data-act="csv-veiculos">${ic("download")} CSV</button></div>` +
      (rs.length
        ? `<div class="veic-list" style="margin-top:8px">${rs.map(cardVeic).join("")}</div>`
        : `<section class="card"><div class="empty"><b>Nenhuma placa encontrada</b>Confira a busca ou os filtros.</div></section>`);
    animar(area);
  }
  function sugestoes() {
    const inp = $<HTMLInputElement>("#v-busca"),
      box = $("#v-sug");
    if (!inp || !box) return;
    const q = busca(S.vq);
    if (!q) {
      box.hidden = true;
      box.innerHTML = "";
      inp.setAttribute("aria-expanded", "false");
      return;
    }
    const achados = filtrados()
      .filter((r) => busca(r.placa).includes(q))
      .sort((a, b) => a.placa.localeCompare(b.placa))
      .slice(0, 8);
    if (!achados.length) {
      box.innerHTML = `<div class="sug-empty">Nenhuma placa com “${esc(S.vq)}”.</div>`;
      box.hidden = false;
      inp.setAttribute("aria-expanded", "true");
      return;
    }
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i");
    box.innerHTML = achados
      .map((r) => {
        const marc = esc(r.placa).replace(re, "<mark>$1</mark>");
        return `<button type="button" class="sug-item" role="option" data-act="sug" data-v="${esc(r.placa)}"><span class="placa">${marc}</span><span>${esc(r.modelo)} · ${esc(r.cor)}</span><b>${moeda(precoFinal(r))}</b></button>`;
      })
      .join("");
    box.hidden = false;
    inp.setAttribute("aria-expanded", "true");
  }

  /* ===================== aba: comparar ===================== */
  function vComparar(rec: Reg[]) {
    const mods = agg(rec, (r) => r.modelo).sort(porN);
    if (!mods.length) return vazio("Nenhum veículo com esses filtros", "Remova algum filtro para ver os dados.");
    const linhas = mods
      .map((m) => {
        const rs = rec.filter((r) => r.modelo === m.k),
          fipe = rs[0].fipe,
          medF = Math.round(rs.reduce((a, r) => a + precoFinal(r), 0) / rs.length);
        const medA = Math.round(rs.reduce((a, r) => a + r.anuncio, 0) / rs.length);
        return `<tr><td>${esc(m.k)}</td><td>${fmt(m.n)}</td><td>${moeda(fipe)}</td><td>${moeda(medA)}</td><td${medF < fipe ? ' class="neg-t"' : ""}>${moeda(medF)}</td><td>${difTag(((medF - fipe) / fipe) * 100)}</td></tr>`;
      })
      .join("");
    const kmF = FAIXAS_KM.map((f) => ({ k: f, n: rec.filter((r) => faixaKm(r.km) === f).length })).filter(
      (x) => x.n
    ) as Agregado[];
    const diasF = FAIXAS_DIAS.map((f) => ({ k: f, n: rec.filter((r) => faixaDias(r.dias) === f).length })).filter(
      (x) => x.n
    ) as Agregado[];
    return (
      `<div class="grid">` +
      card("Preço", "Ajuste de valor", painelAjuste(), { cls: "span-2" }) +
      card(
        "Equiparação",
        "Modelos: FIPE x anúncio x final",
        `<div class="heat-wrap"><table class="tbl"><thead><tr><th>Modelo</th><th>Qtd.</th><th>FIPE</th><th>Anúncio médio</th><th>Final médio</th><th>x FIPE</th></tr></thead><tbody>${linhas}</tbody></table></div>`,
        { cls: "span-2", nota: "Médias por modelo, com o ajuste aplicado." }
      ) +
      card("Quilometragem", "Veículos por faixa de km", barras(kmF, { act: "faixaKm", tom: "tone-teal", total: rec.length, ativos: S.f.faixaKm }), {
        nota: "Toque em uma faixa para filtrar.",
      }) +
      card("Estoque", "Tempo de pátio", barras(diasF, { act: "faixaDias", tom: "tone-orange", total: rec.length, ativos: S.f.faixaDias }), {
        nota: "Toque em uma faixa para filtrar.",
      }) +
      `</div>`
    );
  }

  /* ===================== painéis ===================== */
  let painel: string | null = null,
    focoAnterior: HTMLElement | null = null;
  function abrirPainel(tipo: string, tit: string, sub: string, corpo: string, rodape?: string) {
    const sh = $("#sheet")!,
      sc = $("#scrim")!;
    $("#sheet-title")!.textContent = tit;
    $("#sheet-sub")!.textContent = sub || "";
    $("#sheet-body")!.innerHTML = corpo;
    $("#sheet-foot")!.innerHTML = rodape || "";
    $("#sheet-body")!.scrollTop = 0;
    if (!painel) {
      focoAnterior = document.activeElement as HTMLElement;
      sh.hidden = false;
      sc.hidden = false;
      requestAnimationFrame(() => {
        sh.classList.add("show");
        sc.classList.add("show");
      });
      document.body.classList.add("sheet-open");
      if (!(history.state && history.state.painel)) {
        try {
          history.pushState({ painel: 1 }, "");
        } catch {
          /* sem histórico */
        }
      }
    }
    painel = tipo;
    animar($("#sheet-body")!);
    setTimeout(() => $<HTMLElement>("#sheet-close")!.focus({ preventScroll: true }), 60);
  }
  function fecharPainel(doHistorico?: boolean) {
    if (!painel) return;
    painel = null;
    $("#sheet")!.classList.remove("show");
    $("#scrim")!.classList.remove("show");
    document.body.classList.remove("sheet-open");
    setTimeout(() => {
      if (!painel) {
        $("#sheet")!.hidden = true;
        $("#scrim")!.hidden = true;
      }
    }, 330);
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus({ preventScroll: true });
    if (!doHistorico && history.state && history.state.painel) history.back();
  }

  /* ===================== galeria de fotos e admin (NOVO na FEAT-005) ====== */
  let sessaoAdmin = false;
  let placaAtual: string | null = null;
  let imagensAtuais: ImagemMeta[] = [];
  let fotoIndice = 0;
  // Guardado fora do DOM porque a galeria é redesenhada depois de cada envio
  // ou remoção; sem isso a mensagem ("Foto adicionada.") sumia na hora.
  let statusFoto = { texto: "", erro: false };

  function galeriaHtml() {
    const temFoto = imagensAtuais.length > 0;
    const idx = Math.min(fotoIndice, Math.max(0, imagensAtuais.length - 1));
    let h = `<div class="galeria" id="galeria">`;
    if (temFoto) {
      const img = imagensAtuais[idx];
      h +=
        `<div class="galeria-main">` +
        `<img src="/api/imagens/${encodeURIComponent(img.id)}" alt="Foto ${idx + 1} de ${imagensAtuais.length} do veículo ${esc(placaAtual)}" loading="lazy">` +
        (imagensAtuais.length > 1
          ? `<button type="button" class="galeria-nav prev" data-act="foto-prev" aria-label="Foto anterior">${ic("chevron-right")}</button>` +
            `<button type="button" class="galeria-nav next" data-act="foto-next" aria-label="Próxima foto">${ic("chevron-right")}</button>`
          : "") +
        (sessaoAdmin
          ? `<button type="button" class="galeria-del" data-act="foto-remover" data-v="${esc(img.id)}" aria-label="Remover esta foto">${ic("x")} Remover</button>`
          : "") +
        `</div>` +
        `<div class="galeria-dots" role="tablist" aria-label="Selecionar foto">` +
        imagensAtuais
          .map(
            (im, i) =>
              `<button type="button" class="galeria-dot${i === idx ? " is-active" : ""}" data-act="foto-ir" data-v="${i}" aria-label="Foto ${i + 1}" aria-selected="${i === idx}"></button>`
          )
          .join("") +
        `</div>`;
    } else {
      h += `<div class="galeria-vazia"><b>Sem fotos</b><span>Este veículo ainda não tem fotos cadastradas.</span></div>`;
    }
    if (sessaoAdmin) {
      const cheio = imagensAtuais.length >= 5;
      // Dois campos: "Tirar foto" abre a câmera direto (capture); "Da galeria"
      // abre o seletor de fotos do aparelho e aceita várias de uma vez.
      const botoes = cheio
        ? `<span class="btn primary galeria-upload desativado">${ic("image")} Limite de 5 fotos</span>`
        : `<label class="btn primary galeria-upload">${ic("camera")} Tirar foto` +
          `<input type="file" id="foto-camera" accept="image/*" capture="environment" hidden></label>` +
          `<label class="btn ghost galeria-upload">${ic("image")} Da galeria` +
          `<input type="file" id="foto-galeria" accept="image/*" multiple hidden></label>`;
      h +=
        `<div class="galeria-admin">` +
        `<div class="galeria-botoes">${botoes}</div>` +
        `<p class="galeria-status${statusFoto.erro ? " erro" : ""}" id="foto-status" aria-live="polite">${esc(statusFoto.texto)}</p>` +
        `</div>`;
    }
    h += `</div>`;
    return h;
  }

  function renderGaleria() {
    const alvo = $("#galeria-slot");
    if (!alvo) return;
    alvo.innerHTML = galeriaHtml();
  }

  async function carregarImagens(placa: string) {
    try {
      const resp = await fetch(`/api/veiculos/${encodeURIComponent(placa)}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!resp.ok) {
        imagensAtuais = [];
      } else {
        const dados = (await resp.json()) as { imagens?: ImagemMeta[] };
        imagensAtuais = Array.isArray(dados.imagens) ? dados.imagens : [];
      }
    } catch {
      imagensAtuais = [];
    }
    fotoIndice = 0;
    if (placaAtual === placa && painel === "veic") renderGaleria();
  }

  function msgStatus(texto: string, erro = false) {
    statusFoto = { texto, erro };
    const el = $("#foto-status");
    if (el) {
      el.textContent = texto;
      el.classList.toggle("erro", erro);
    }
  }

  // A Vercel recusa corpos de requisição acima de 4,5 MB antes de chegar à
  // rota, e fotos de celular costumam passar disso. Por isso a foto é
  // reduzida no navegador ao mesmo tamanho que o servidor guardaria (lado
  // maior de 1600 px, JPEG) antes do envio; o servidor recomprime de qualquer
  // forma. Usa createImageBitmap (sem URL blob:, que a CSP img-src 'self'
  // bloquearia). Se o navegador não conseguir decodificar, envia o original.
  const FOTO_LADO_MAXIMO = 1600;
  const FOTO_LIMITE_ENVIO = 4 * 1024 * 1024;
  const FOTO_SEM_REDUCAO_ATE = 1024 * 1024;

  async function decodificarFoto(file: File): Promise<ImageBitmap> {
    try {
      // "from-image" aplica a rotação do EXIF (foto em pé continua em pé).
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return await createImageBitmap(file);
    }
  }

  function canvasParaJpeg(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
  }

  async function reduzirFoto(file: File): Promise<Blob> {
    const tiposAceitos = ["image/jpeg", "image/png", "image/webp"];
    if (file.size <= FOTO_SEM_REDUCAO_ATE && tiposAceitos.includes(file.type)) {
      return file;
    }
    if (typeof createImageBitmap !== "function") return file;
    let bitmap: ImageBitmap;
    try {
      bitmap = await decodificarFoto(file);
    } catch {
      return file;
    }
    const escala = Math.min(1, FOTO_LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // Fundo branco: PNG com transparência não vira preto no JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const qualidade of [0.85, 0.7, 0.55]) {
      const blob = await canvasParaJpeg(canvas, qualidade);
      if (blob && blob.size <= FOTO_LIMITE_ENVIO) return blob;
    }
    return file;
  }

  /**
   * Envia uma foto. `rotulo` vai nas mensagens de progresso quando há várias
   * (ex.: " 2 de 3"). Retorna "ok", "erro" (falhou só esta; pode seguir com
   * as próximas) ou "parar" (limite atingido ou sessão expirada).
   */
  async function enviarFoto(file: File, placa: string, rotulo = ""): Promise<"ok" | "erro" | "parar"> {
    msgStatus(`Preparando foto${rotulo}…`);
    const foto = await reduzirFoto(file);
    msgStatus(`Enviando foto${rotulo}…`);
    const fd = new FormData();
    if (foto === file) {
      fd.append("arquivo", file);
    } else {
      fd.append("arquivo", foto, "foto.jpg");
    }
    try {
      const resp = await fetch(`/api/veiculos/${encodeURIComponent(placa)}/imagens`, {
        method: "POST",
        body: fd,
      });
      if (resp.status === 201) {
        await carregarImagens(placa);
        fotoIndice = Math.max(0, imagensAtuais.length - 1);
        if (placaAtual === placa) renderGaleria();
        return "ok";
      }
      if (resp.status === 409) {
        msgStatus("Limite de 5 fotos por veículo atingido.", true);
        return "parar";
      }
      if (resp.status === 401) {
        msgStatus("Sessão expirada. Entre novamente para enviar fotos.", true);
        await verificarSessao();
        if (placaAtual === placa && painel === "veic") renderGaleria();
        return "parar";
      }
      if (resp.status === 413) {
        msgStatus(`Foto${rotulo} muito grande. Escolha uma foto menor.`, true);
      } else if (resp.status === 400) {
        msgStatus(`Foto${rotulo} inválida. Use uma imagem JPG, PNG ou WebP.`, true);
      } else {
        msgStatus(`Não foi possível enviar a foto${rotulo}. Tente de novo.`, true);
      }
      return "erro";
    } catch {
      msgStatus(`Falha de conexão ao enviar a foto${rotulo}.`, true);
      return "erro";
    }
  }

  /** Envia uma ou mais fotos em sequência, respeitando as vagas restantes (máx. 5). */
  async function enviarFotos(arquivos: File[]) {
    if (!placaAtual || arquivos.length === 0) return;
    const placa = placaAtual;
    const vagas = Math.max(0, 5 - imagensAtuais.length);
    if (vagas === 0) {
      msgStatus("Limite de 5 fotos por veículo atingido.", true);
      return;
    }
    const fila = arquivos.slice(0, vagas);
    const total = fila.length;
    let enviadas = 0;
    let falhas = 0;
    for (let i = 0; i < total; i++) {
      const rotulo = total > 1 ? ` ${i + 1} de ${total}` : "";
      const r = await enviarFoto(fila[i], placa, rotulo);
      if (r === "ok") enviadas++;
      else if (r === "erro") falhas++;
      else return;
    }
    const sobra = arquivos.length - total;
    if (falhas === 0) {
      let texto = enviadas === 1 ? "Foto adicionada." : `${enviadas} fotos adicionadas.`;
      if (sobra > 0) texto += ` ${sobra} não ${sobra === 1 ? "coube" : "couberam"} (limite de 5 fotos).`;
      msgStatus(texto, sobra > 0);
    } else if (total > 1) {
      msgStatus(`${enviadas} de ${total} fotos adicionadas; ${falhas} falharam. Tente as que faltaram de novo.`, true);
    }
  }

  async function removerFoto(id: string) {
    if (!placaAtual) return;
    const placa = placaAtual;
    msgStatus("Removendo foto…");
    try {
      const resp = await fetch(
        `/api/veiculos/${encodeURIComponent(placa)}/imagens/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (resp.status === 204) {
        msgStatus("Foto removida.");
        await carregarImagens(placa);
        if (placaAtual === placa) renderGaleria();
      } else if (resp.status === 401) {
        msgStatus("Sessão expirada. Entre novamente.", true);
        await verificarSessao();
        if (placaAtual === placa && painel === "veic") renderGaleria();
      } else {
        msgStatus("Não foi possível remover a foto.", true);
      }
    } catch {
      msgStatus("Falha de conexão ao remover a foto.", true);
    }
  }

  function painelVeic(placa: string) {
    const r = REG.find((x) => x.placa === placa);
    if (!r) return;
    placaAtual = placa;
    imagensAtuais = [];
    fotoIndice = 0;
    statusFoto = { texto: "", erro: false };
    const fin = precoFinal(r),
      d = difFipe(r),
      descFipe = r.fipe - fin;
    const mesmoMod = REG.filter((x) => x.modelo === r.modelo);
    const posKm = mesmoMod.slice().sort((a, b) => a.km - b.km).findIndex((x) => x.placa === placa) + 1;
    const linha = (rot: string, val: string) => `<div class="det-row"><span>${rot}</span><b>${val}</b></div>`;
    const h =
      `<div class="placa-grande">${esc(r.placa)}</div>` +
      `<div id="galeria-slot">${galeriaHtml()}</div>` +
      `<div class="mini tres"><div class="dark"><b>${moedaK(r.fipe)}</b><span>FIPE</span></div>` +
      `<div><b>${moedaK(r.anuncio)}</b><span>anúncio</span></div><div><b class="${fin < r.anuncio ? "tp" : fin > r.anuncio ? "to" : ""}">${moedaK(fin)}</b><span>valor final</span></div></div>` +
      `<div class="alert ${d < 0 ? "info" : ""}" style="margin-top:10px">${difTag(d)} em relação à FIPE · ${descFipe >= 0 ? moeda(descFipe) + " abaixo" : moeda(-descFipe) + " acima"} da tabela${AJUSTE !== 0 ? ` <span class="card-note">(ajuste de ${AJUSTE > 0 ? "+" : ""}${dec1(AJUSTE)}% aplicado)</span>` : ""}.</div>` +
      `<h3>Dados do veículo</h3><div class="det">` +
      linha("Modelo", esc(r.modelo)) +
      linha("Versão", esc(r.versao)) +
      linha("Ano", esc(r.ano)) +
      linha("Cor", `${selo(r.cor)} ${esc(r.cor)}`) +
      linha("Quilometragem", fmt(r.km) + " km") +
      linha("Tempo em estoque", `${r.dias} dias`) +
      linha("Loja", esc(r.loja)) +
      linha("UF", esc(r.uf)) +
      linha("Utilização", esc(r.utilizacao)) +
      linha("Empresa", esc(r.empresa)) +
      `</div>` +
      `<p class="card-note" style="margin:10px 0 0">Entre os ${mesmoMod.length} ${esc(r.modelo)}, este é o ${posKm}º de menor quilometragem.</p>`;
    abrirPainel(
      "veic",
      r.placa,
      `${r.modelo} · ${r.cor}`,
      h,
      `<button type="button" class="btn" data-act="fechar-painel">Fechar</button><button type="button" class="btn primary" data-act="filtrar-modelo" data-v="${esc(r.modelo)}">${ic("layers")} Ver o modelo</button>`
    );
    void carregarImagens(placa);
  }

  function valoresFiltro(k: ChaveFiltro): string[] {
    if (k === "faixaKm") return FAIXAS_KM.filter((f) => REG.some((r) => faixaKm(r.km) === f));
    if (k === "faixaDias") return FAIXAS_DIAS.filter((f) => REG.some((r) => faixaDias(r.dias) === f));
    const m = new Map<string, number>();
    for (const r of REG) {
      const v = String(valor(r, k));
      m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map((a) => a[0]);
  }
  const faceta = (k: ChaveFiltro, v: string) =>
    REG.filter((r) => passa(r, k) && String(valor(r, k)) === v).length;
  function corpoFiltros() {
    const grupo = (k: ChaveFiltro) =>
      `<div class="f-group"><b>${F_LABEL[k]}</b><div class="f-chips">` +
      valoresFiltro(k)
        .map((v) => {
          const on = S.f[k].has(v),
            n = faceta(k, v);
          return `<button type="button" class="f-chip" data-act="${k}" data-v="${esc(v)}" aria-pressed="${on}"${n || on ? "" : " data-zero"}>${k === "cor" ? selo(v) : ""}${esc(rotF(k, v))}<small>${fmt(n)}</small></button>`;
        })
        .join("") +
      `</div></div>`;
    return (
      MULTI.map(grupo).join("") +
      `<p class="card-note" style="margin:0">A busca por placa fica na aba Veículos.</p>`
    );
  }
  const rodapeFiltros = () =>
    `<button type="button" class="btn" data-act="limpar">${ic("x")} Limpar</button>` +
    `<button type="button" class="btn primary" data-act="fechar-painel">Ver ${nVe(filtrados().length)}</button>`;
  const subFiltros = () =>
    `${nAtivos() || "Nenhum"} filtro${nAtivos() === 1 ? "" : "s"} ativo${nAtivos() === 1 ? "" : "s"}`;
  const painelFiltros = () => abrirPainel("filtros", "Filtros", subFiltros(), corpoFiltros(), rodapeFiltros());
  function atualizarPainelFiltros() {
    const b = $("#sheet-body")!,
      y = b.scrollTop;
    b.innerHTML = corpoFiltros();
    b.scrollTop = y;
    $("#sheet-foot")!.innerHTML = rodapeFiltros();
    $("#sheet-sub")!.textContent = subFiltros();
  }
  function painelFontes() {
    abrirPainel(
      "fontes",
      "Fontes dos dados",
      "De onde vêm os números desta tela",
      `<div class="src"><div class="src-top"><b>Estoque de veículos</b><span class="pill on">Banco de dados</span></div><dl>` +
        `<dt>Relatório</dt><dd>${esc(CFG.fonte)}</dd><dt>Loja</dt><dd>${esc(REG[0]?.loja || "")}</dd><dt>Local</dt><dd>${esc(CFG.local)}</dd>` +
        `<dt>Origem</dt><dd>Banco Neon (Postgres) via API</dd><dt>Veículos</dt><dd>${fmt(REG.length)}</dd></dl></div>` +
        `<h3 style="margin:14px 0 8px;font-size:14px">Como os valores funcionam</h3><ul class="ajustes">` +
        `<li>A <b>FIPE</b> é o valor de tabela por modelo e não muda com o ajuste.</li>` +
        `<li>O <b>anúncio</b> é o preço do relatório (atacado). O <b>valor final</b> é o anúncio com o ajuste percentual aplicado.</li>` +
        `<li>A diferença <b>x FIPE</b> compara o valor final com a FIPE. Verde = abaixo da FIPE.</li>` +
        `<li>O ajuste vale para toda a dashboard enquanto estiver aberta; “Restaurar” volta ao preço de anúncio.</li></ul>` +
        `<p class="card-note" style="margin:10px 0 0">Os dados são carregados do banco a cada visita. As fotos são enviadas pelo administrador e guardadas no mesmo banco.</p>`,
      `<button type="button" class="btn primary" data-act="fechar-painel">Fechar</button>`
    );
  }

  /* ===================== área de administração ===================== */
  function painelAdmin() {
    const corpo = sessaoAdmin
      ? `<div class="alert info">Você está autenticado como administrador. Abra um veículo para adicionar ou remover fotos.</div>` +
        `<div style="margin-top:12px"><button type="button" class="btn" data-act="admin-logout">Sair da conta de administrador</button></div>`
      : `<p class="card-note" style="margin:0 0 12px">Entre com a conta de administrador para gerenciar as fotos dos veículos. A visualização da dashboard é pública.</p>` +
        `<form id="admin-form" class="admin-form">` +
        `<label class="admin-campo"><span>E-mail</span><input id="admin-email" type="email" autocomplete="username" required></label>` +
        `<label class="admin-campo"><span>Senha</span><input id="admin-senha" type="password" autocomplete="current-password" required></label>` +
        `<p class="galeria-status" id="admin-status" aria-live="polite"></p>` +
        `<button type="submit" class="btn primary" id="admin-entrar">Entrar</button>` +
        `</form>`;
    abrirPainel(
      "admin",
      "Administração",
      sessaoAdmin ? "Sessão ativa" : "Acesso restrito ao administrador",
      corpo,
      `<button type="button" class="btn primary" data-act="fechar-painel">Fechar</button>`
    );
  }

  async function verificarSessao() {
    try {
      const resp = await fetch("/api/auth/session", { headers: { accept: "application/json" } });
      const dados = (await resp.json()) as EstadoSessao;
      sessaoAdmin = !!dados.autenticado;
    } catch {
      sessaoAdmin = false;
    }
    atualizarBotaoAdmin();
  }

  function atualizarBotaoAdmin() {
    const b = $("#btn-admin");
    if (b) {
      b.setAttribute("aria-label", sessaoAdmin ? "Administração (sessão ativa)" : "Administração");
      b.title = b.getAttribute("aria-label") || "";
      b.classList.toggle("ativo", sessaoAdmin);
    }
  }

  async function fazerLogin(email: string, senha: string) {
    const status = $("#admin-status");
    if (status) {
      status.textContent = "Entrando…";
      status.classList.remove("erro");
    }
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      if (resp.ok) {
        sessaoAdmin = true;
        atualizarBotaoAdmin();
        painelAdmin();
      } else if (resp.status === 429) {
        if (status) {
          status.textContent = "Muitas tentativas. Aguarde um minuto e tente de novo.";
          status.classList.add("erro");
        }
      } else {
        if (status) {
          status.textContent = "E-mail ou senha incorretos.";
          status.classList.add("erro");
        }
      }
    } catch {
      if (status) {
        status.textContent = "Falha de conexão. Tente de novo.";
        status.classList.add("erro");
      }
    }
  }

  async function fazerLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignora */
    }
    sessaoAdmin = false;
    atualizarBotaoAdmin();
    painelAdmin();
  }

  /* ===================== render ===================== */
  const VIEWS: Record<string, (rec: Reg[]) => string> = {
    geral: vGeral,
    modelos: vModelos,
    veiculos: vVeiculos,
    comparar: vComparar,
  };
  const KPIS: [string, string, string][] = [
    ["total", "Veículos", "t-n"],
    ["modelos", "Modelos", "t-n"],
    ["final", "Valor final (soma)", "t-l"],
    ["medio", "Valor final médio", "t-l"],
    ["dif", "Média x FIPE", "t-p"],
    ["km", "Km médio", "t-n"],
  ];
  function renderHero() {
    const mods = agg(REG, (r) => r.modelo).sort(porN),
      t = REG.length;
    contar($("#h-total"), t);
    const cores = [
      corModelo(mods[0] && mods[0].k),
      corModelo(mods[1] && mods[1].k),
      corModelo(mods[2] && mods[2].k),
    ];
    ["h-l", "h-p", "h-c"].forEach((id, i) => {
      const el = $("#" + id);
      if (el) {
        el.style.background = cores[i] || "transparent";
        el.style.width = (mods[i] ? (mods[i].n / t) * 100 : 0) + "%";
      }
    });
    $("#h-legend")!.innerHTML = mods
      .map((m) => `<span style="color:${corModelo(m.k)}">${esc(m.k)} · ${fmt(m.n)}</span>`)
      .join("");
    const fin = REG.reduce((a, r) => a + precoFinal(r), 0);
    $("#h-ratio")!.innerHTML = `<b>${moedaK(fin)}</b>soma do valor final${AJUSTE ? ` · ajuste ${AJUSTE > 0 ? "+" : ""}${dec1(AJUSTE)}%` : ""}`;
  }
  function renderKpis(rec: Reg[]) {
    const n = rec.length,
      fin = rec.reduce((a, r) => a + precoFinal(r), 0),
      fipe = rec.reduce((a, r) => a + r.fipe, 0);
    const kmMed = n ? Math.round(rec.reduce((a, r) => a + r.km, 0) / n) : 0;
    const set = (k: string, v: number, sub: string, f: (n: number) => string = fmt) => {
      contar($(`[data-k="${k}"]`), v, f);
      $(`[data-s="${k}"]`)!.textContent = sub;
    };
    set("total", n, nAtivos() ? "com os filtros" : "disponíveis");
    set("modelos", new Set(rec.map((r) => r.modelo)).size, "no estoque filtrado");
    set("final", fin, `${nAtivos() ? "filtrado" : "estoque todo"}`, moedaK);
    set("medio", n ? Math.round(fin / n) : 0, "por veículo", moedaK);
    set("dif", fipe ? ((fin - fipe) / fipe) * 100 : NaN, "valor final x FIPE", (v) => (v > 0 ? "+" : "") + dec1(v) + "%");
    set("km", kmMed, "quilometragem", (n) => fmt(n) + " km");
  }
  const chipX = (k: ChaveFiltro, v: string) =>
    `<button type="button" class="chip-x" data-act="rm" data-k="${k}" data-v="${esc(v)}" aria-label="Remover filtro ${esc(v)}">${esc(v)}${ic("x")}</button>`;
  function renderChips() {
    const out: string[] = [];
    if (S.vq)
      out.push(`<button type="button" class="chip-x" data-act="placa-clear">Placa: ${esc(S.vq)}${ic("x")}</button>`);
    MULTI.forEach((k) => S.f[k].forEach((v) => out.push(chipX(k, v))));
    $("#chips")!.innerHTML = out.length
      ? out.join("") + `<button type="button" class="chip-x limpar" data-act="limpar">Limpar tudo</button>`
      : `<span class="chips-hint">Sem filtros ativos</span>`;
    $("#f-count")!.textContent = String(nAtivos() || "");
    $("#print-filters")!.textContent = out.length
      ? "Filtros: " +
        [S.vq ? `Placa: ${S.vq}` : null, ...MULTI.flatMap((k) => [...S.f[k]].map((v) => `${F_LABEL[k]}: ${v}`))]
          .filter(Boolean)
          .join(" · ")
      : "Sem filtros";
  }
  function renderView(trocouAba?: boolean) {
    ci = 0;
    const rec = filtrados(),
      v = $("#view") as HTMLElement & { _t?: ReturnType<typeof setTimeout> };
    v.innerHTML = VIEWS[S.tab](rec);
    if (trocouAba) {
      v.classList.remove("anim");
      void v.offsetWidth;
      v.classList.add("anim");
      clearTimeout(v._t);
      v._t = setTimeout(() => v.classList.remove("anim"), 900);
    }
    if (S.tab === "veiculos") listaVeiculos();
    animar(v);
    renderKpis(rec);
  }
  function render(trocouAba?: boolean) {
    renderHero();
    renderChips();
    renderView(trocouAba);
    if (painel === "filtros") atualizarPainelFiltros();
  }
  function trocarAba(t: string, rolar = true) {
    if (!VIEWS[t]) t = "geral";
    const mudou = S.tab !== t;
    S.tab = t;
    $$(".tab").forEach((b) => {
      const on = (b as HTMLElement).dataset.v === t;
      b.setAttribute("aria-selected", String(on));
      (b as HTMLElement).tabIndex = on ? 0 : -1;
    });
    try {
      history.replaceState(history.state, "", "#" + t);
    } catch {
      /* sem histórico */
    }
    renderView(mudou);
    if (rolar) {
      const alvo =
        $("#kpis")!.getBoundingClientRect().top + window.scrollY - (innerWidth >= 900 ? 130 : 70);
      if (window.scrollY > alvo)
        window.scrollTo({ top: Math.max(0, alvo), behavior: reduz.matches ? "auto" : "smooth" });
    }
  }
  function renderStatus() {
    const st = $("#status")!;
    st.dataset.s = "online";
    $("#status-txt")!.textContent = "Dados do banco";
    const av = $("#notice")!;
    av.dataset.s = "online";
    av.innerHTML =
      `${ic("info")}<div><p>Você está vendo o estoque de <b>${esc(REG[0]?.loja || "CS Seminovos")}</b>, carregado do banco de dados. ${fmt(REG.length)} veículos.</p>` +
      `<div class="acts"><button type="button" class="btn ghost" data-act="fontes">${ic("database")} Detalhes</button></div></div>` +
      `<button type="button" class="notice-close" data-act="fechar-aviso" aria-label="Fechar aviso">${ic("x")}</button>`;
    av.hidden = S.avisoFechado;
  }
  function renderFooter() {
    $("#footer")!.innerHTML =
      `<b>Fonte:</b> relatório “${esc(CFG.fonte)}” · ${esc(REG[0]?.loja || "")} · ${esc(CFG.local)}. Dados carregados do banco. ` +
      `<button type="button" class="link-btn" data-act="fontes" style="display:inline;min-height:0;padding:0">Ver detalhes</button><br>` +
      `FIPE é o valor de tabela. O valor final aplica o ajuste percentual sobre o anúncio. Documento de uso interno.`;
  }

  /* ===================== exportação ===================== */
  function baixarCSV(nome: string, linhas: (string | number)[][]) {
    const cel = (c: string | number) => {
      let s = String(c ?? "");
      if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "\uFEFF" + linhas.map((l) => l.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }
  const hoje = () => new Date().toISOString().slice(0, 10);
  function csvVeiculos() {
    baixarCSV(`veiculos-pv-${hoje()}.csv`, [
      ["Placa", "Modelo", "Versão", "Ano", "Cor", "Km", "Dias em estoque", "FIPE", "Anúncio", `Valor final (${AJUSTE > 0 ? "+" : ""}${dec1(AJUSTE)}%)`, "x FIPE %"],
      ...veicVisiveis().map((r) => [r.placa, r.modelo, r.versao, r.ano, r.cor, r.km, r.dias, r.fipe, r.anuncio, precoFinal(r), dec1(difFipe(r))]),
    ]);
  }

  /* ===================== eventos ===================== */
  function alternar(k: ChaveFiltro, v: string) {
    const s = S.f[k];
    if (s.has(v)) s.delete(v);
    else s.add(v);
  }
  function limpar() {
    S.vq = "";
    MULTI.forEach((k) => S.f[k].clear());
  }
  function aplicarAjuste(v: number | string) {
    let num = Math.max(-90, Math.min(200, Number(v) || 0));
    AJUSTE = Math.round(num * 10) / 10;
    render();
  }
  function tema(t: string) {
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("veic-tema", t);
    } catch {
      /* indisponível */
    }
    const b = $("#btn-theme")!;
    b.innerHTML = ic(t === "dark" ? "sun" : "moon");
    b.setAttribute("aria-label", t === "dark" ? "Usar tema claro" : "Usar tema escuro");
    b.title = b.getAttribute("aria-label") || "";
  }

  const isMulti = (a: string): a is ChaveFiltro => (MULTI as readonly string[]).includes(a);

  const onClick = (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (!b) return;
    const a = b.dataset.act!,
      v = b.dataset.v!;
    if (isMulti(a)) {
      alternar(a, v);
      render();
      return;
    }
    switch (a) {
      case "tab":
        trocarAba(v);
        break;
      case "rm":
        S.f[b.dataset.k as ChaveFiltro].delete(v);
        render();
        break;
      case "limpar":
        limpar();
        render();
        break;
      case "veic-det":
        painelVeic(v);
        break;
      case "sug": {
        const inp = $<HTMLInputElement>("#v-busca");
        S.vq = v;
        if (inp) inp.value = v;
        const box = $("#v-sug");
        if (box) box.hidden = true;
        render();
        break;
      }
      case "placa-clear":
        S.vq = "";
        render();
        break;
      case "ver-modelo":
        S.f.modelo = new Set([v]);
        trocarAba("veiculos");
        render();
        break;
      case "filtrar-modelo":
        S.f.modelo = new Set([v]);
        fecharPainel();
        render();
        break;
      case "ajuste-reset":
        aplicarAjuste(0);
        break;
      case "csv-veiculos":
        csvVeiculos();
        break;
      case "fontes":
        painelFontes();
        break;
      case "filtros":
        painelFiltros();
        break;
      case "fechar-painel":
        fecharPainel();
        break;
      case "fechar-aviso":
        S.avisoFechado = true;
        $("#notice")!.hidden = true;
        break;
      case "tema":
        tema(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
        break;
      case "imprimir":
        window.print();
        break;
      case "admin":
        painelAdmin();
        break;
      case "admin-logout":
        void fazerLogout();
        break;
      case "foto-prev":
        if (imagensAtuais.length) {
          fotoIndice = (fotoIndice - 1 + imagensAtuais.length) % imagensAtuais.length;
          renderGaleria();
        }
        break;
      case "foto-next":
        if (imagensAtuais.length) {
          fotoIndice = (fotoIndice + 1) % imagensAtuais.length;
          renderGaleria();
        }
        break;
      case "foto-ir":
        fotoIndice = Number(v) || 0;
        renderGaleria();
        break;
      case "foto-remover":
        void removerFoto(v);
        break;
      default:
        break;
    }
  };

  const onInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.id === "v-busca") {
      S.vq = target.value;
      renderChips();
      renderKpis(filtrados());
      listaVeiculos();
      sugestoes();
    } else if (target.id === "ajuste-range") {
      AJUSTE = Math.round(Number(target.value) * 10) / 10;
      const num = $<HTMLInputElement>("#ajuste-num");
      if (num) num.value = dec1(AJUSTE);
      aplicarAjusteLeve();
    } else if (target.id === "foto-camera" || target.id === "foto-galeria") {
      const arquivos = target.files ? Array.from(target.files) : [];
      target.value = "";
      void enviarFotos(arquivos);
    }
  };

  let ajTimer: ReturnType<typeof setTimeout> | null = null;
  function aplicarAjusteLeve() {
    renderHero();
    renderKpis(filtrados());
    const sinal = AJUSTE > 0 ? "+" : "";
    $$<HTMLElement>(".ajuste-val b").forEach((el) => {
      el.textContent = sinal + dec1(AJUSTE) + "%";
      el.className = AJUSTE < 0 ? "neg" : AJUSTE > 0 ? "pos" : "";
    });
    if (ajTimer) clearTimeout(ajTimer);
    ajTimer = setTimeout(() => render(), 220);
  }

  const onChange = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.id === "v-ordem") {
      S.vs = target.value;
      listaVeiculos();
    } else if (target.id === "ajuste-num") aplicarAjuste(target.value);
    else if (target.id === "ajuste-range") aplicarAjuste(target.value);
  };

  const onKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.id === "v-busca" && e.key === "Enter") {
      const prim = filtrados()
        .filter((r) => busca(r.placa).includes(busca(S.vq)))
        .sort((a, b) => a.placa.localeCompare(b.placa))[0];
      if (prim) {
        e.preventDefault();
        painelVeic(prim.placa);
      }
      return;
    }
    if (!painel) return;
    if (e.key === "Escape") {
      e.preventDefault();
      fecharPainel();
      return;
    }
    if (e.key !== "Tab") return;
    const foc = $$<HTMLElement>("#sheet button, #sheet a[href], #sheet input, #sheet select").filter(
      (x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null
    );
    if (!foc.length) return;
    const [p, u] = [foc[0], foc[foc.length - 1]];
    if (e.shiftKey && document.activeElement === p) {
      e.preventDefault();
      u.focus();
    } else if (!e.shiftKey && document.activeElement === u) {
      e.preventDefault();
      p.focus();
    }
  };

  const onSubmit = (e: Event) => {
    const form = e.target as HTMLElement;
    if (form.id === "admin-form") {
      e.preventDefault();
      const email = $<HTMLInputElement>("#admin-email")?.value.trim() || "";
      const senha = $<HTMLInputElement>("#admin-senha")?.value || "";
      void fazerLogin(email, senha);
    }
  };

  const onScrimClick = () => fecharPainel();
  const onSheetClose = () => fecharPainel();
  const onTabsKeydown = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tabs = $$<HTMLElement>(".tab"),
      i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    trocarAba(n.dataset.v!);
    n.focus();
  };
  const onDocClickFechaSug = (e: MouseEvent) => {
    if (!(e.target as Element).closest(".search-wrap") && $("#v-sug")) $("#v-sug")!.hidden = true;
  };
  const onPopstate = () => {
    if (painel) fecharPainel(true);
  };

  /* ===================== início ===================== */
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onDocClickFechaSug);
  const scrim = $("#scrim")!;
  const sheetClose = $("#sheet-close")!;
  const tabsEl = $(".tabs")!;
  scrim.addEventListener("click", onScrimClick);
  sheetClose.addEventListener("click", onSheetClose);
  tabsEl.addEventListener("keydown", onTabsKeydown as EventListener);
  window.addEventListener("popstate", onPopstate);

  $("#sub-loja")!.textContent = `${REG[0]?.loja || "CS Seminovos"} · ${CFG.local}`;
  $("#kpis")!.innerHTML = KPIS.map(
    ([k, l, c], i) =>
      `<div class="kpi ${c}" style="--i:${i}"><span class="kpi-label">${l}</span><span class="kpi-val" data-k="${k}">0</span><span class="kpi-sub" data-s="${k}"></span></div>`
  ).join("");
  tema(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const abaInicial = (location.hash || "").slice(1);
  S.tab = VIEWS[abaInicial] ? abaInicial : "geral";
  $$(".tab").forEach((b) => {
    const on = (b as HTMLElement).dataset.v === S.tab;
    b.setAttribute("aria-selected", String(on));
    (b as HTMLElement).tabIndex = on ? 0 : -1;
  });
  renderHero();
  renderStatus();
  renderFooter();
  renderChips();
  renderView(true);
  atualizarBotaoAdmin();
  void verificarSessao();

  const dash = {
    REG,
    S,
    CFG,
    filtrados,
    precoFinal,
    get AJUSTE() {
      return AJUSTE;
    },
    setAjuste: aplicarAjuste,
  };
  (window as unknown as { __DASH__: typeof dash }).__DASH__ = dash;

  return {
    destruir() {
      document.removeEventListener("click", onClick);
      document.removeEventListener("input", onInput);
      document.removeEventListener("change", onChange);
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("click", onDocClickFechaSug);
      scrim.removeEventListener("click", onScrimClick);
      sheetClose.removeEventListener("click", onSheetClose);
      tabsEl.removeEventListener("keydown", onTabsKeydown as EventListener);
      window.removeEventListener("popstate", onPopstate);
      try {
        delete (window as unknown as { __DASH__?: unknown }).__DASH__;
      } catch {
        /* ignora */
      }
    },
  };
}
