(() => {
'use strict';
/* ===================== utilidades ===================== */
const CFG = JSON.parse(document.getElementById('cfg').textContent);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduz = matchMedia('(prefers-reduced-motion: reduce)');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(Number(n) || 0).toLocaleString('pt-BR');
const pct = (a, b, d = 1) => (b ? (a / b * 100).toFixed(d).replace('.', ',') + '%' : '–');
const dec1 = n => Number(n).toFixed(1).replace('.', ',');
const moeda = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR');
const moedaK = n => 'R$ ' + (Number(n) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
const km = n => fmt(n) + ' km';
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const sem = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const busca = s => sem(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const plural = (n, um, varios) => `${fmt(n)} ${Math.round(n) === 1 ? um : varios}`;
const nVe = n => plural(n, 'veículo', 'veículos');

/* ===================== dados ===================== */
const REG = CFG.registros.map((r, i) => ({ ...r, i }));
const COR_HEX = CFG.coresHex || {};
const MODELOS = [...new Set(REG.map(r => r.modelo))];
const COR_PALETA = ['#1f4f78', '#2078a8', '#08a39a', '#f5a20b', '#c2410c', '#7fb3d5'];
const corModelo = m => COR_PALETA[MODELOS.indexOf(m) % COR_PALETA.length];
const faixaKm = v => v < 30000 ? 'Até 30 mil' : v < 60000 ? '30 a 60 mil' : v < 90000 ? '60 a 90 mil' : 'Acima de 90 mil';
const FAIXAS_KM = ['Até 30 mil', '30 a 60 mil', '60 a 90 mil', 'Acima de 90 mil'];
const faixaDias = d => d <= 20 ? 'Até 20 dias' : d <= 40 ? '21 a 40 dias' : d <= 60 ? '41 a 60 dias' : 'Mais de 60 dias';
const FAIXAS_DIAS = ['Até 20 dias', '21 a 40 dias', '41 a 60 dias', 'Mais de 60 dias'];

/* preço final = anúncio ajustado pelo delta do usuário (em pontos percentuais sobre o anúncio).
   ajuste 0 = preço de anúncio original. */
let AJUSTE = 0;
const precoFinal = r => Math.round(r.anuncio * (1 + AJUSTE / 100));
const difFipe = r => (precoFinal(r) - r.fipe) / r.fipe * 100;

/* ===================== filtros ===================== */
const MULTI = ['modelo', 'cor', 'faixaKm', 'faixaDias'];
const F_LABEL = { modelo: 'Modelo', cor: 'Cor', faixaKm: 'Quilometragem', faixaDias: 'Tempo de estoque' };
const S = { f: {}, tab: 'geral', vq: '', vs: 'dias', avisoFechado: false };
MULTI.forEach(k => { S.f[k] = new Set(); });
const valor = (r, k) => ({ modelo: r.modelo, cor: r.cor, faixaKm: faixaKm(r.km), faixaDias: faixaDias(r.dias) }[k]);
function passa(r, ignora) {
  for (const k of MULTI) {
    if (k === ignora || !S.f[k].size) continue;
    if (!S.f[k].has(String(valor(r, k)))) return false;
  }
  if (S.vq) { const q = busca(S.vq); if (q && !busca(r.placa).includes(q)) return false; }
  return true;
}
const filtrados = () => REG.filter(r => passa(r));
const nAtivos = () => (S.vq ? 1 : 0) + MULTI.reduce((a, k) => a + S.f[k].size, 0);
const rotF = (k, v) => v;

/* ===================== agregação e peças ===================== */
function agg(rs, fn) {
  const m = new Map();
  for (const r of rs) {
    const k = fn(r); if (k == null || k === '') continue;
    const o = m.get(k) || { k: String(k), n: 0, anuncio: 0, fipe: 0, final: 0, km: 0 };
    o.n++; o.anuncio += r.anuncio; o.fipe += r.fipe; o.final += precoFinal(r); o.km += r.km;
    m.set(k, o);
  }
  return [...m.values()];
}
const porN = (a, b) => b.n - a.n || a.k.localeCompare(b.k, 'pt-BR', { numeric: true });
let ci = 0;
function card(kicker, tit, corpo, o = {}) {
  return `<section class="card ${o.cls || ''}" style="--i:${ci++}"><div class="kicker${o.own ? ' own' : ''}">${esc(kicker)}</div>` +
    `<h2>${esc(tit)}</h2>${o.nota ? `<p class="card-note">${o.nota}</p>` : ''}${corpo}</section>`;
}
const vazio = (t, d) => `<section class="card span-2"><div class="empty"><b>${esc(t)}</b>${esc(d)}` +
  `<div style="margin-top:14px"><button type="button" class="btn" data-act="limpar">${ic('x')} Limpar filtros</button></div></div></section>`;
function barras(itens, o = {}) {
  const val = o.valor || (x => x.n), mx = o.max || Math.max(1, ...itens.map(val));
  return `<div class="bars ${o.tom || ''}">` + itens.map(x => {
    const v = val(x), on = !!(o.ativos && o.ativos.has(x.k));
    const dentro = `<span class="bar-label">${o.rot ? o.rot(x) : esc(x.k)}</span><span class="bar-track"><span class="bar-fill" data-w="${(v / mx * 100).toFixed(2)}"></span></span>` +
      `<span class="bar-val"><b>${o.fmtV ? o.fmtV(v) : fmt(v)}</b>${o.total ? `<small>${pct(v, o.total)}</small>` : ''}</span>`;
    return o.act ? `<button type="button" class="bar${on ? ' is-active' : ''}" data-act="${o.act}" data-v="${esc(x.k)}" aria-pressed="${on}">${dentro}</button>` : `<div class="bar">${dentro}</div>`;
  }).join('') + '</div>';
}
const pilha = partes => `<span class="stack">${partes.map(([cor, w]) => `<span style="background:${cor}" data-w="${(w || 0).toFixed(2)}"></span>`).join('')}</span>`;
function animar(root) {
  const go = () => {
    $$('[data-w]', root).forEach(e => { e.style.width = e.dataset.w + '%'; });
    $$('[data-da]', root).forEach(e => { e.style.strokeDasharray = e.dataset.da; });
  };
  if (reduz.matches) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
}
function contar(el, para, f = fmt) {
  if (!el) return;
  const de = Number(el.dataset.v || 0); el.dataset.v = para;
  cancelAnimationFrame(el._raf);
  if (!Number.isFinite(para)) { el.textContent = '–'; el.dataset.v = 0; return; }
  if (reduz.matches || de === para) { el.textContent = f(para); return; }
  const t0 = performance.now(), dur = 600;
  const passo = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = f(de + (para - de) * e); if (k < 1) el._raf = requestAnimationFrame(passo); };
  el._raf = requestAnimationFrame(passo);
}
const selo = cor => `<span class="cor-dot" style="background:${COR_HEX[cor] || '#8b97a5'}"></span>`;
const difTag = d => { const cls = d < 0 ? 'neg' : d > 0 ? 'pos' : 'zero'; const s = d > 0 ? '+' : ''; return `<span class="dif ${cls}">${s}${dec1(d)}%</span>`; };

/* ===================== barra de ajuste de preço ===================== */
function painelAjuste() {
  const rs = filtrados(), anun = rs.reduce((a, r) => a + r.anuncio, 0), fin = rs.reduce((a, r) => a + precoFinal(r), 0);
  const sinal = AJUSTE > 0 ? '+' : '';
  return `<div class="ajuste">` +
    `<div class="ajuste-top"><div><b>Ajuste de preço</b><span>aplica um percentual sobre o anúncio e mostra o valor final</span></div>` +
    `<div class="ajuste-val"><b class="${AJUSTE < 0 ? 'neg' : AJUSTE > 0 ? 'pos' : ''}">${sinal}${dec1(AJUSTE)}%</b></div></div>` +
    `<input id="ajuste-range" class="range" type="range" min="-30" max="30" step="0.5" value="${AJUSTE}" aria-label="Ajuste percentual sobre o anúncio">` +
    `<div class="ajuste-row">` +
    `<label class="ajuste-in"><span>%</span><input id="ajuste-num" type="number" inputmode="decimal" step="0.5" min="-90" max="200" value="${dec1(AJUSTE)}"></label>` +
    `<button type="button" class="btn" data-act="ajuste-reset"${AJUSTE === 0 ? ' disabled' : ''}>${ic('refresh')} Restaurar</button>` +
    `</div>` +
    `<div class="ajuste-tot"><div><span>Anúncio (soma)</span><b>${moeda(anun)}</b></div><div><span>Valor final (soma)</span><b class="${fin < anun ? 'neg' : fin > anun ? 'pos' : ''}">${moeda(fin)}</b></div></div>` +
    (AJUSTE !== 0 ? `<p class="card-note" style="margin:8px 0 0">O valor final e a diferença sobre a FIPE em toda a dashboard usam este ajuste. A FIPE não muda.</p>` : '') +
    `</div>`;
}

/* ===================== aba: geral ===================== */
function vGeral(rec) {
  if (!rec.length) return vazio('Nenhum veículo com esses filtros', 'Remova algum filtro para ver os dados.');
  const n = rec.length, anun = rec.reduce((a, r) => a + r.anuncio, 0), fin = rec.reduce((a, r) => a + precoFinal(r), 0), fipe = rec.reduce((a, r) => a + r.fipe, 0);
  const difMed = (fin - fipe) / fipe * 100;
  const mods = agg(rec, r => r.modelo).sort(porN), t = n;
  const C = 2 * Math.PI * 52; let off = 0;
  const segs = mods.map(m => { const len = m.n / t * C, s = `<circle class="seg" cx="66" cy="66" r="52" style="stroke:${corModelo(m.k)};stroke-dasharray:0 ${C};stroke-dashoffset:${-off}" data-da="${len} ${C}"/>`; off += len; return s; }).join('');
  const rosca = `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 132 132" role="img" aria-label="Veículos por modelo">` +
    `<circle class="bg" cx="66" cy="66" r="52"/>${segs}</svg><div class="donut-c"><b>${fmt(t)}</b><span>veículos</span></div></div><div class="dl">` +
    mods.map(m => `<div class="dl-row"><i style="background:${corModelo(m.k)}"></i><span>${esc(m.k)}<small>${pct(m.n, t)}</small></span><b>${fmt(m.n)}</b></div>`).join('') + `</div></div>`;
  const cores = agg(rec, r => r.cor).sort(porN);
  const corBars = `<div class="bars">` + cores.map(c => {
    const on = S.f.cor.has(c.k);
    return `<button type="button" class="bar${on ? ' is-active' : ''}" data-act="cor" data-v="${esc(c.k)}" aria-pressed="${on}">` +
      `<span class="bar-label">${selo(c.k)}${esc(c.k)}</span><span class="bar-track"><span class="bar-fill" style="background:${COR_HEX[c.k] || 'var(--navy-tone)'}" data-w="${(c.n / cores[0].n * 100).toFixed(2)}"></span></span>` +
      `<span class="bar-val"><b>${fmt(c.n)}</b><small>${pct(c.n, t)}</small></span></button>`;
  }).join('') + `</div>`;
  return `<div class="grid">` +
    card('Preço', 'Ajuste de valor', painelAjuste(), { cls: 'span-2' }) +
    card('Composição', 'Veículos por modelo', rosca, { nota: 'Toque em um modelo na aba Modelos para ver o detalhe.' }) +
    card('Cores', 'Veículos por cor', corBars, { nota: 'Toque em uma cor para filtrar.' }) +
    card('Destaques', 'O que os dados mostram', destaques(rec), {}) +
    card('Preços', 'FIPE x anúncio x final', resumoPreco(rec, { anun, fin, fipe, difMed }), { nota: 'Somas do estoque filtrado.' }) +
    `</div>`;
}
function resumoPreco(rec, t) {
  const descFipe = rec.reduce((a, r) => a + (r.fipe - precoFinal(r)), 0);
  return `<div class="mini tres"><div class="dark"><b>${moedaK(t.fipe)}</b><span>soma FIPE</span></div>` +
    `<div><b>${moedaK(t.anun)}</b><span>soma anúncio</span></div>` +
    `<div><b class="${t.fin < t.anun ? 'tp' : ''}">${moedaK(t.fin)}</b><span>soma valor final</span></div></div>` +
    `<div class="mini two" style="margin-top:8px"><div><b>${difTag(t.difMed)}</b><span>final x FIPE (média ponderada)</span></div>` +
    `<div><b>${moedaK(descFipe)}</b><span>abaixo da FIPE no total</span></div></div>`;
}
function destaques(rec) {
  const item = (n, cls, txt) => `<li><span class="n ${cls}">${n}</span><p>${txt}</p></li>`;
  const mods = agg(rec, r => r.modelo).sort(porN), top = mods[0];
  const barato = rec.slice().sort((a, b) => precoFinal(a) - precoFinal(b))[0];
  const menorKm = rec.slice().sort((a, b) => a.km - b.km)[0];
  const maiorDesc = rec.slice().sort((a, b) => difFipe(a) - difFipe(b))[0];
  const antigo = rec.slice().sort((a, b) => b.dias - a.dias)[0];
  return `<ul class="insights">` +
    (top ? item(fmt(top.n), 'l', `<b>${esc(top.k)}</b> é o modelo com mais unidades: ${nVe(top.n)}.`) : '') +
    (barato ? item(moedaK(precoFinal(barato)), 'p', `menor valor final: <b>${esc(barato.placa)}</b> (${esc(barato.modelo)}, ${esc(barato.cor)}).`) : '') +
    (maiorDesc ? item(dec1(difFipe(maiorDesc)) + '%', 'p', `maior desconto sobre a FIPE: <b>${esc(maiorDesc.placa)}</b>, ${moedaK(precoFinal(maiorDesc))} ante ${moedaK(maiorDesc.fipe)} de FIPE.`) : '') +
    (menorKm ? item(km(menorKm.km), '', `menor rodagem: <b>${esc(menorKm.placa)}</b> (${esc(menorKm.modelo)}).`) : '') +
    (antigo ? item(antigo.dias + 'd', '', `mais tempo em estoque: <b>${esc(antigo.placa)}</b>, ${antigo.dias} dias no pátio.`) : '') + `</ul>`;
}

/* ===================== aba: modelos ===================== */
function vModelos(rec) {
  const mods = agg(rec, r => r.modelo).sort(porN);
  if (!mods.length) return vazio('Nenhum veículo com esses filtros', 'Remova algum filtro para ver os dados.');
  return `<div class="grid">` + card('Preço', 'Ajuste de valor', painelAjuste(), { cls: 'span-2' }) + mods.map(m => {
    const rs = rec.filter(r => r.modelo === m.k), fipe = rs[0].fipe;
    const fin = rs.reduce((a, r) => a + precoFinal(r), 0), anun = rs.reduce((a, r) => a + r.anuncio, 0);
    const minF = Math.min(...rs.map(precoFinal)), maxF = Math.max(...rs.map(precoFinal)), medF = Math.round(fin / rs.length);
    const cores = agg(rs, r => r.cor).sort(porN);
    const on = S.f.modelo.has(m.k);
    const corpo = `<div class="cal-big"><b>${fmt(m.n)}</b><span>unidades</span></div>` +
      `<div class="mini tres" style="margin-top:10px"><div class="dark"><b>${moedaK(fipe)}</b><span>FIPE (tabela)</span></div>` +
      `<div><b>${moedaK(medF)}</b><span>valor final médio</span></div><div><b>${difTag((medF - fipe) / fipe * 100)}</b><span>final x FIPE</span></div></div>` +
      `<div class="legend" style="margin-top:10px"><span>Final: <b>${moeda(minF)}</b> a <b>${moeda(maxF)}</b></span><span>Soma final: <b>${moedaK(fin)}</b></span></div>` +
      `<h3>Cores</h3><div class="f-chips">${cores.map(c => `<button type="button" class="f-chip" data-act="cor" data-v="${esc(c.k)}" aria-pressed="${S.f.cor.has(c.k)}">${selo(c.k)}${esc(c.k)}<small>${fmt(c.n)}</small></button>`).join('')}</div>` +
      `<button type="button" class="link-btn" data-act="modelo" data-v="${esc(m.k)}" aria-pressed="${on}">${on ? 'Remover filtro deste modelo' : 'Filtrar este modelo'}</button>` +
      ` · <button type="button" class="link-btn" data-act="ver-modelo" data-v="${esc(m.k)}" style="display:inline">Ver os ${m.n} veículos</button>`;
    return card('Modelo', m.k, corpo, { nota: esc(rs[0].versao) });
  }).join('') + `</div>`;
}

/* ===================== aba: veículos (lista + busca por placa) ===================== */
const ORDENS = [['dias', 'Mais tempo em estoque'], ['dias-', 'Menos tempo em estoque'], ['final', 'Menor valor final'], ['final-', 'Maior valor final'], ['km', 'Menor km'], ['km-', 'Maior km'], ['placa', 'Placa (A–Z)']];
function vVeiculos() {
  return `<div class="grid"><section class="card span-2" style="--i:0"><div class="kicker">Consulta</div><h2>Buscar por placa</h2>` +
    `<div class="toolbar"><div class="search-wrap"><label class="search"><span class="sr-only">Buscar placa</span>${ic('search')}` +
    `<input id="v-busca" type="search" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Digite a placa (ex.: RSU7B01)" value="${esc(S.vq)}" aria-expanded="false" aria-controls="v-sug" role="combobox">` +
    (S.vq ? `<button type="button" class="in-clear" data-act="placa-clear" aria-label="Limpar busca">${ic('x')}</button>` : '') + `</label><div id="v-sug" class="sug" role="listbox" hidden></div></div>` +
    `<label><span class="sr-only">Ordenar</span><select class="sel" id="v-ordem">${ORDENS.map(([v, t]) => `<option value="${v}"${S.vs === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>` +
    `<p class="card-note" style="margin:10px 0 0">A busca sugere placas enquanto você digita. Toque em uma sugestão ou num cartão para ver todos os dados do veículo.</p></section>` +
    `<div class="span-2" id="v-area"></div></div>`;
}
function veicVisiveis() {
  let rs = filtrados();
  const ord = {
    dias: (a, b) => b.dias - a.dias || a.km - b.km, 'dias-': (a, b) => a.dias - b.dias,
    final: (a, b) => precoFinal(a) - precoFinal(b), 'final-': (a, b) => precoFinal(b) - precoFinal(a),
    km: (a, b) => a.km - b.km, 'km-': (a, b) => b.km - a.km,
    placa: (a, b) => a.placa.localeCompare(b.placa),
  }[S.vs] || ((a, b) => b.dias - a.dias);
  return rs.sort(ord);
}
function cardVeic(r, i) {
  const d = difFipe(r);
  return `<button type="button" class="veic" style="--i:${Math.min(i, 18)}" data-act="veic-det" data-v="${esc(r.placa)}">` +
    `<span class="veic-head"><span class="placa">${esc(r.placa)}</span>${selo(r.cor)}<span class="veic-cor">${esc(r.cor)}</span></span>` +
    `<span class="veic-mod">${esc(r.modelo)}</span>` +
    `<span class="veic-meta"><span>${km(r.km)}</span><span>${r.dias} dias</span></span>` +
    `<span class="veic-preco"><b>${moeda(precoFinal(r))}</b>${difTag(d)}</span></button>`;
}
function listaVeiculos() {
  const area = $('#v-area'); if (!area) return;
  const rs = veicVisiveis();
  area.innerHTML = `<div class="count-line"><span>${nVe(rs.length)}${S.vq ? ' · busca “' + esc(S.vq) + '”' : ''}</span>` +
    `<button type="button" class="btn ghost" data-act="csv-veiculos">${ic('download')} CSV</button></div>` +
    (rs.length ? `<div class="veic-list" style="margin-top:8px">${rs.map(cardVeic).join('')}</div>`
      : `<section class="card"><div class="empty"><b>Nenhuma placa encontrada</b>Confira a busca ou os filtros.</div></section>`);
  animar(area);
}
function sugestoes() {
  const inp = $('#v-busca'), box = $('#v-sug'); if (!inp || !box) return;
  const q = busca(S.vq);
  if (!q) { box.hidden = true; box.innerHTML = ''; inp.setAttribute('aria-expanded', 'false'); return; }
  const achados = filtrados().filter(r => busca(r.placa).includes(q)).sort((a, b) => a.placa.localeCompare(b.placa)).slice(0, 8);
  if (!achados.length) { box.innerHTML = `<div class="sug-empty">Nenhuma placa com “${esc(S.vq)}”.</div>`; box.hidden = false; inp.setAttribute('aria-expanded', 'true'); return; }
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i');
  box.innerHTML = achados.map(r => {
    const marc = esc(r.placa).replace(re, '<mark>$1</mark>');
    return `<button type="button" class="sug-item" role="option" data-act="sug" data-v="${esc(r.placa)}"><span class="placa">${marc}</span><span>${esc(r.modelo)} · ${esc(r.cor)}</span><b>${moeda(precoFinal(r))}</b></button>`;
  }).join('');
  box.hidden = false; inp.setAttribute('aria-expanded', 'true');
}

/* ===================== aba: comparar ===================== */
function vComparar(rec) {
  const mods = agg(rec, r => r.modelo).sort(porN);
  if (!mods.length) return vazio('Nenhum veículo com esses filtros', 'Remova algum filtro para ver os dados.');
  const linhas = mods.map(m => {
    const rs = rec.filter(r => r.modelo === m.k), fipe = rs[0].fipe, medF = Math.round(rs.reduce((a, r) => a + precoFinal(r), 0) / rs.length);
    const medA = Math.round(rs.reduce((a, r) => a + r.anuncio, 0) / rs.length);
    return `<tr><td>${esc(m.k)}</td><td>${fmt(m.n)}</td><td>${moeda(fipe)}</td><td>${moeda(medA)}</td><td${medF < fipe ? ' class="neg-t"' : ''}>${moeda(medF)}</td><td>${difTag((medF - fipe) / fipe * 100)}</td></tr>`;
  }).join('');
  const kmF = FAIXAS_KM.map(f => ({ k: f, n: rec.filter(r => faixaKm(r.km) === f).length })).filter(x => x.n);
  const diasF = FAIXAS_DIAS.map(f => ({ k: f, n: rec.filter(r => faixaDias(r.dias) === f).length })).filter(x => x.n);
  return `<div class="grid">` +
    card('Preço', 'Ajuste de valor', painelAjuste(), { cls: 'span-2' }) +
    card('Equiparação', 'Modelos: FIPE x anúncio x final', `<div class="heat-wrap"><table class="tbl"><thead><tr><th>Modelo</th><th>Qtd.</th><th>FIPE</th><th>Anúncio médio</th><th>Final médio</th><th>x FIPE</th></tr></thead><tbody>${linhas}</tbody></table></div>`, { cls: 'span-2', nota: 'Médias por modelo, com o ajuste aplicado.' }) +
    card('Quilometragem', 'Veículos por faixa de km', barras(kmF, { act: 'faixaKm', tom: 'tone-teal', total: rec.length, ativos: S.f.faixaKm }), { nota: 'Toque em uma faixa para filtrar.' }) +
    card('Estoque', 'Tempo de pátio', barras(diasF, { act: 'faixaDias', tom: 'tone-orange', total: rec.length, ativos: S.f.faixaDias }), { nota: 'Toque em uma faixa para filtrar.' }) +
    `</div>`;
}

/* ===================== painéis ===================== */
let painel = null, focoAnterior = null;
function abrirPainel(tipo, tit, sub, corpo, rodape) {
  const sh = $('#sheet'), sc = $('#scrim');
  $('#sheet-title').textContent = tit; $('#sheet-sub').textContent = sub || '';
  $('#sheet-body').innerHTML = corpo; $('#sheet-foot').innerHTML = rodape || '';
  $('#sheet-body').scrollTop = 0;
  if (!painel) {
    focoAnterior = document.activeElement;
    sh.hidden = false; sc.hidden = false;
    requestAnimationFrame(() => { sh.classList.add('show'); sc.classList.add('show'); });
    document.body.classList.add('sheet-open');
    if (!(history.state && history.state.painel)) { try { history.pushState({ painel: 1 }, ''); } catch (e) { /* sem histórico */ } }
  }
  painel = tipo;
  animar($('#sheet-body'));
  setTimeout(() => $('#sheet-close').focus({ preventScroll: true }), 60);
}
function fecharPainel(doHistorico) {
  if (!painel) return;
  painel = null;
  $('#sheet').classList.remove('show'); $('#scrim').classList.remove('show');
  document.body.classList.remove('sheet-open');
  setTimeout(() => { if (!painel) { $('#sheet').hidden = true; $('#scrim').hidden = true; } }, 330);
  if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus({ preventScroll: true });
  if (!doHistorico && history.state && history.state.painel) history.back();
}
function painelVeic(placa) {
  const r = REG.find(x => x.placa === placa); if (!r) return;
  const fin = precoFinal(r), d = difFipe(r), descFipe = r.fipe - fin;
  const mesmoMod = REG.filter(x => x.modelo === r.modelo);
  const posKm = mesmoMod.slice().sort((a, b) => a.km - b.km).findIndex(x => x.placa === placa) + 1;
  const linha = (rot, val) => `<div class="det-row"><span>${rot}</span><b>${val}</b></div>`;
  let h = `<div class="placa-grande">${esc(r.placa)}</div>` +
    `<div class="mini tres"><div class="dark"><b>${moedaK(r.fipe)}</b><span>FIPE</span></div>` +
    `<div><b>${moedaK(r.anuncio)}</b><span>anúncio</span></div><div><b class="${fin < r.anuncio ? 'tp' : fin > r.anuncio ? 'to' : ''}">${moedaK(fin)}</b><span>valor final</span></div></div>` +
    `<div class="alert ${d < 0 ? 'info' : ''}" style="margin-top:10px">${difTag(d)} em relação à FIPE · ${descFipe >= 0 ? moeda(descFipe) + ' abaixo' : moeda(-descFipe) + ' acima'} da tabela${AJUSTE !== 0 ? ` <span class="card-note">(ajuste de ${AJUSTE > 0 ? '+' : ''}${dec1(AJUSTE)}% aplicado)</span>` : ''}.</div>` +
    `<h3>Dados do veículo</h3><div class="det">` +
    linha('Modelo', esc(r.modelo)) + linha('Versão', esc(r.versao)) + linha('Ano', esc(r.ano)) +
    linha('Cor', `${selo(r.cor)} ${esc(r.cor)}`) + linha('Quilometragem', km(r.km)) + linha('Tempo em estoque', `${r.dias} dias`) +
    linha('Loja', esc(r.loja)) + linha('UF', esc(r.uf)) + linha('Utilização', esc(r.utilizacao)) + linha('Empresa', esc(r.empresa)) + `</div>` +
    `<p class="card-note" style="margin:10px 0 0">Entre os ${mesmoMod.length} ${esc(r.modelo)}, este é o ${posKm}º de menor quilometragem.</p>`;
  abrirPainel('veic', r.placa, `${r.modelo} · ${r.cor}`, h,
    `<button type="button" class="btn" data-act="fechar-painel">Fechar</button><button type="button" class="btn primary" data-act="filtrar-modelo" data-v="${esc(r.modelo)}">${ic('layers')} Ver o modelo</button>`);
}
function valoresFiltro(k) {
  if (k === 'faixaKm') return FAIXAS_KM.filter(f => REG.some(r => faixaKm(r.km) === f));
  if (k === 'faixaDias') return FAIXAS_DIAS.filter(f => REG.some(r => faixaDias(r.dias) === f));
  const m = new Map();
  for (const r of REG) { const v = valor(r, k); m.set(v, (m.get(v) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(a => a[0]);
}
const faceta = (k, v) => REG.filter(r => passa(r, k) && String(valor(r, k)) === v).length;
function corpoFiltros() {
  const grupo = k => `<div class="f-group"><b>${F_LABEL[k]}</b><div class="f-chips">` + valoresFiltro(k).map(v => {
    const on = S.f[k].has(v), n = faceta(k, v);
    return `<button type="button" class="f-chip" data-act="${k}" data-v="${esc(v)}" aria-pressed="${on}"${n || on ? '' : ' data-zero'}>${k === 'cor' ? selo(v) : ''}${esc(rotF(k, v))}<small>${fmt(n)}</small></button>`;
  }).join('') + `</div></div>`;
  return MULTI.map(grupo).join('') + `<p class="card-note" style="margin:0">A busca por placa fica na aba Veículos.</p>`;
}
const rodapeFiltros = () => `<button type="button" class="btn" data-act="limpar">${ic('x')} Limpar</button>` +
  `<button type="button" class="btn primary" data-act="fechar-painel">Ver ${nVe(filtrados().length)}</button>`;
const subFiltros = () => `${nAtivos() || 'Nenhum'} filtro${nAtivos() === 1 ? '' : 's'} ativo${nAtivos() === 1 ? '' : 's'}`;
const painelFiltros = () => abrirPainel('filtros', 'Filtros', subFiltros(), corpoFiltros(), rodapeFiltros());
function atualizarPainelFiltros() {
  const b = $('#sheet-body'), y = b.scrollTop;
  b.innerHTML = corpoFiltros(); b.scrollTop = y; $('#sheet-foot').innerHTML = rodapeFiltros();
  $('#sheet-sub').textContent = subFiltros();
}
function painelFontes() {
  abrirPainel('fontes', 'Fontes dos dados', 'De onde vêm os números desta tela',
    `<div class="src"><div class="src-top"><b>Estoque de veículos</b><span class="pill off">Dados fixos</span></div><dl>` +
    `<dt>Relatório</dt><dd>${esc(CFG.fonte)}</dd><dt>Loja</dt><dd>${esc(CFG.loja)}</dd><dt>Local</dt><dd>${esc(CFG.local)}</dd>` +
    `<dt>Dados de</dt><dd>${esc(CFG.data)} (gravados neste arquivo)</dd><dt>Veículos</dt><dd>${fmt(REG.length)}</dd></dl></div>` +
    `<h3 style="margin:14px 0 8px;font-size:14px">Como os valores funcionam</h3><ul class="ajustes">` +
    `<li>A <b>FIPE</b> é o valor de tabela por modelo e não muda com o ajuste.</li>` +
    `<li>O <b>anúncio</b> é o preço do relatório (atacado). O <b>valor final</b> é o anúncio com o ajuste percentual aplicado.</li>` +
    `<li>A diferença <b>x FIPE</b> compara o valor final com a FIPE. Verde = abaixo da FIPE.</li>` +
    `<li>O ajuste vale para toda a dashboard enquanto estiver aberta; “Restaurar” volta ao preço de anúncio.</li></ul>` +
    `<p class="card-note" style="margin:10px 0 0">Esta dashboard não acessa a internet. Para atualizar, gere o arquivo de novo com o relatório novo.</p>`,
    `<button type="button" class="btn primary" data-act="fechar-painel">Fechar</button>`);
}

/* ===================== render ===================== */
const VIEWS = { geral: vGeral, modelos: vModelos, veiculos: vVeiculos, comparar: vComparar };
const KPIS = [['total', 'Veículos', 't-n'], ['modelos', 'Modelos', 't-n'], ['final', 'Valor final (soma)', 't-l'],
  ['medio', 'Valor final médio', 't-l'], ['dif', 'Média x FIPE', 't-p'], ['km', 'Km médio', 't-n']];
function renderHero() {
  const mods = agg(REG, r => r.modelo).sort(porN), t = REG.length;
  contar($('#h-total'), t);
  const cores = [corModelo(mods[0] && mods[0].k), corModelo(mods[1] && mods[1].k), corModelo(mods[2] && mods[2].k)];
  ['h-l', 'h-p', 'h-c'].forEach((id, i) => { const el = $('#' + id); if (el) { el.style.background = cores[i] || 'transparent'; el.style.width = (mods[i] ? mods[i].n / t * 100 : 0) + '%'; } });
  $('#h-legend').innerHTML = mods.map(m => `<span style="color:${corModelo(m.k)}">${esc(m.k)} · ${fmt(m.n)}</span>`).join('');
  const fin = REG.reduce((a, r) => a + precoFinal(r), 0);
  $('#h-ratio').innerHTML = `<b>${moedaK(fin)}</b>soma do valor final${AJUSTE ? ` · ajuste ${AJUSTE > 0 ? '+' : ''}${dec1(AJUSTE)}%` : ''}`;
}
function renderKpis(rec) {
  const n = rec.length, fin = rec.reduce((a, r) => a + precoFinal(r), 0), fipe = rec.reduce((a, r) => a + r.fipe, 0);
  const kmMed = n ? Math.round(rec.reduce((a, r) => a + r.km, 0) / n) : 0;
  const set = (k, v, sub, f = fmt) => { contar($(`[data-k="${k}"]`), v, f); $(`[data-s="${k}"]`).textContent = sub; };
  set('total', n, nAtivos() ? 'com os filtros' : 'disponíveis');
  set('modelos', new Set(rec.map(r => r.modelo)).size, 'no estoque filtrado');
  set('final', fin, `${nAtivos() ? 'filtrado' : 'estoque todo'}`, moedaK);
  set('medio', n ? Math.round(fin / n) : 0, 'por veículo', moedaK);
  set('dif', fipe ? (fin - fipe) / fipe * 100 : NaN, 'valor final x FIPE', v => (v > 0 ? '+' : '') + dec1(v) + '%');
  set('km', kmMed, 'quilometragem', km);
}
const chipX = (k, v) => `<button type="button" class="chip-x" data-act="rm" data-k="${k}" data-v="${esc(v)}" aria-label="Remover filtro ${esc(v)}">${esc(v)}${ic('x')}</button>`;
function renderChips() {
  const out = [];
  if (S.vq) out.push(`<button type="button" class="chip-x" data-act="placa-clear">Placa: ${esc(S.vq)}${ic('x')}</button>`);
  MULTI.forEach(k => S.f[k].forEach(v => out.push(chipX(k, v))));
  $('#chips').innerHTML = out.length ? out.join('') + `<button type="button" class="chip-x limpar" data-act="limpar">Limpar tudo</button>`
    : `<span class="chips-hint">Sem filtros ativos</span>`;
  $('#f-count').textContent = nAtivos() || '';
  $('#print-filters').textContent = out.length ? 'Filtros: ' + [S.vq ? `Placa: ${S.vq}` : null, ...MULTI.flatMap(k => [...S.f[k]].map(v => `${F_LABEL[k]}: ${v}`))].filter(Boolean).join(' · ') : 'Sem filtros';
}
function renderView(trocouAba) {
  ci = 0;
  const rec = filtrados(), v = $('#view');
  v.innerHTML = VIEWS[S.tab](rec);
  if (trocouAba) { v.classList.remove('anim'); void v.offsetWidth; v.classList.add('anim'); clearTimeout(v._t); v._t = setTimeout(() => v.classList.remove('anim'), 900); }
  if (S.tab === 'veiculos') listaVeiculos();
  animar(v);
  renderKpis(rec);
}
function render(trocouAba) { renderHero(); renderChips(); renderView(trocouAba); if (painel === 'filtros') atualizarPainelFiltros(); }
function trocarAba(t, rolar = true) {
  if (!VIEWS[t]) t = 'geral';
  const mudou = S.tab !== t; S.tab = t;
  $$('.tab').forEach(b => { const on = b.dataset.v === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
  try { history.replaceState(history.state, '', '#' + t); } catch (e) { /* sem histórico */ }
  renderView(mudou);
  if (rolar) {
    const alvo = $('#kpis').getBoundingClientRect().top + window.scrollY - (innerWidth >= 900 ? 130 : 70);
    if (window.scrollY > alvo) window.scrollTo({ top: Math.max(0, alvo), behavior: reduz.matches ? 'auto' : 'smooth' });
  }
}
function renderStatus() {
  $('#status').dataset.s = 'fixo';
  $('#status-txt').textContent = `Dados fixos · ${CFG.data}`;
  const av = $('#notice');
  av.dataset.s = 'fixo';
  av.innerHTML = `${ic('info')}<div><p>Você está vendo o estoque de <b>${esc(CFG.data)}</b> (${esc(CFG.loja)}), gravado neste arquivo. A dashboard não acessa a internet.</p>` +
    `<div class="acts"><button type="button" class="btn ghost" data-act="fontes">${ic('database')} Detalhes</button></div></div>` +
    `<button type="button" class="notice-close" data-act="fechar-aviso" aria-label="Fechar aviso">${ic('x')}</button>`;
  av.hidden = S.avisoFechado;
}
function renderFooter() {
  $('#footer').innerHTML = `<b>Fonte:</b> relatório “${esc(CFG.fonte)}” · ${esc(CFG.loja)} · ${esc(CFG.local)}. Dados fixos de ${esc(CFG.data)}. ` +
    `<button type="button" class="link-btn" data-act="fontes" style="display:inline;min-height:0;padding:0">Ver detalhes</button><br>` +
    `FIPE é o valor de tabela. O valor final aplica o ajuste percentual sobre o anúncio. Documento de uso interno · não acessa a internet.`;
}

/* ===================== exportação ===================== */
function baixarCSV(nome, linhas) {
  const cel = c => { let s = String(c ?? ''); if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '\uFEFF' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const hoje = () => new Date().toISOString().slice(0, 10);
function csvVeiculos() {
  baixarCSV(`veiculos-pv-${hoje()}.csv`, [['Placa', 'Modelo', 'Versão', 'Ano', 'Cor', 'Km', 'Dias em estoque', 'FIPE', 'Anúncio', `Valor final (${AJUSTE > 0 ? '+' : ''}${dec1(AJUSTE)}%)`, 'x FIPE %'],
    ...veicVisiveis().map(r => [r.placa, r.modelo, r.versao, r.ano, r.cor, r.km, r.dias, r.fipe, r.anuncio, precoFinal(r), dec1(difFipe(r))])]);
}

/* ===================== eventos ===================== */
function alternar(k, v) { const s = S.f[k]; if (s.has(v)) s.delete(v); else s.add(v); }
function limpar() { S.vq = ''; MULTI.forEach(k => S.f[k].clear()); }
function aplicarAjuste(v) {
  v = Math.max(-90, Math.min(200, Number(v) || 0));
  AJUSTE = Math.round(v * 10) / 10;
  render();
}
function tema(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('veic-tema', t); } catch (e) { /* indisponível */ }
  const b = $('#btn-theme'); b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon');
  b.setAttribute('aria-label', t === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'); b.title = b.getAttribute('aria-label');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, v = b.dataset.v;
  if (MULTI.includes(a)) { alternar(a, v); render(); return; }
  switch (a) {
    case 'tab': trocarAba(v); break;
    case 'rm': S.f[b.dataset.k].delete(v); render(); break;
    case 'limpar': limpar(); render(); break;
    case 'veic-det': painelVeic(v); break;
    case 'sug': { const inp = $('#v-busca'); S.vq = v; if (inp) inp.value = v; const box = $('#v-sug'); if (box) box.hidden = true; render(); break; }
    case 'placa-clear': S.vq = ''; render(); break;
    case 'ver-modelo': S.f.modelo = new Set([v]); trocarAba('veiculos'); render(); break;
    case 'filtrar-modelo': S.f.modelo = new Set([v]); fecharPainel(); render(); break;
    case 'ajuste-reset': aplicarAjuste(0); break;
    case 'csv-veiculos': csvVeiculos(); break;
    case 'fontes': painelFontes(); break;
    case 'filtros': painelFiltros(); break;
    case 'fechar-painel': fecharPainel(); break;
    case 'fechar-aviso': S.avisoFechado = true; $('#notice').hidden = true; break;
    case 'tema': tema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); break;
    case 'imprimir': window.print(); break;
    default: break;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'v-busca') { S.vq = e.target.value; renderChips(); renderKpis(filtrados()); listaVeiculos(); sugestoes(); }
  else if (e.target.id === 'ajuste-range') { AJUSTE = Math.round(Number(e.target.value) * 10) / 10; const num = $('#ajuste-num'); if (num) num.value = dec1(AJUSTE); aplicarAjusteLeve(); }
  else if (e.target.id === 'ajuste-num') { /* aplica ao confirmar (change/Enter) */ }
});
/* o range atualiza tudo, mas sem recriar o próprio input, para não perder o arraste */
let ajTimer = null;
function aplicarAjusteLeve() {
  renderHero(); renderKpis(filtrados());
  const sinal = AJUSTE > 0 ? '+' : '';
  $$('.ajuste-val b').forEach(el => { el.textContent = sinal + dec1(AJUSTE) + '%'; el.className = AJUSTE < 0 ? 'neg' : AJUSTE > 0 ? 'pos' : ''; });
  clearTimeout(ajTimer); ajTimer = setTimeout(() => render(), 220);
}
document.addEventListener('change', e => {
  if (e.target.id === 'v-ordem') { S.vs = e.target.value; listaVeiculos(); }
  else if (e.target.id === 'ajuste-num') aplicarAjuste(e.target.value);
  else if (e.target.id === 'ajuste-range') aplicarAjuste(e.target.value);
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'v-busca' && e.key === 'Enter') {
    const prim = filtrados().filter(r => busca(r.placa).includes(busca(S.vq))).sort((a, b) => a.placa.localeCompare(b.placa))[0];
    if (prim) { e.preventDefault(); painelVeic(prim.placa); }
    return;
  }
  if (!painel) return;
  if (e.key === 'Escape') { e.preventDefault(); fecharPainel(); return; }
  if (e.key !== 'Tab') return;
  const foc = $$('#sheet button, #sheet a[href], #sheet input, #sheet select').filter(x => !x.disabled && x.offsetParent !== null);
  if (!foc.length) return;
  const [p, u] = [foc[0], foc[foc.length - 1]];
  if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); }
  else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
});
$('#scrim').addEventListener('click', () => fecharPainel());
$('#sheet-close').addEventListener('click', () => fecharPainel());
$('.tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = $$('.tab'), i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
  const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  trocarAba(n.dataset.v); n.focus();
});
document.addEventListener('click', e => { if (!e.target.closest('.search-wrap') && $('#v-sug')) $('#v-sug').hidden = true; });
window.addEventListener('popstate', () => { if (painel) fecharPainel(true); });

/* ===================== início ===================== */
$('#sub-loja').textContent = `${CFG.loja} · ${CFG.local}`;
$('#kpis').innerHTML = KPIS.map(([k, l, c], i) => `<div class="kpi ${c}" style="--i:${i}"><span class="kpi-label">${l}</span><span class="kpi-val" data-k="${k}">0</span><span class="kpi-sub" data-s="${k}"></span></div>`).join('');
tema(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const abaInicial = (location.hash || '').slice(1);
S.tab = VIEWS[abaInicial] ? abaInicial : 'geral';
$$('.tab').forEach(b => { const on = b.dataset.v === S.tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
renderHero(); renderStatus(); renderFooter(); renderChips(); renderView(true);
window.__DASH__ = { REG, S, CFG, filtrados, precoFinal, get AJUSTE() { return AJUSTE; }, setAjuste: aplicarAjuste };
})();
