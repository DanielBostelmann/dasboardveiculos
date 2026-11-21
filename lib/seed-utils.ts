// Parsing e normalização dos dados de veículos a partir do CSV de origem
// (build/fonte/veiculos.csv). Esta lógica espelha build/build.py para manter
// as mesmas 3 categorias de modelo e a mesma normalização de cor/texto.
//
// O módulo é puro (sem acesso ao banco) para poder ser testado sem Neon.

/** Um veículo já normalizado, pronto para persistir (sem o campo derivado `dif`). */
export interface VeiculoParsed {
  placa: string;
  versao: string;
  modelo: string;
  ano: string;
  cor: string;
  km: number;
  diasEstoque: number;
  loja: string;
  uf: string;
  fipe: number;
  anuncioAtacado: number;
  utilizacao: string;
  empresa: string;
}

/**
 * Normaliza a coluna "Versao" em um dos 3 modelos, igual a build.py:
 *   POLO...            -> "VW Polo"
 *   VIRTUS EXCLUSIVE...-> "VW Virtus Exclusive"
 *   VIRTUS TSI...      -> "VW Virtus TSI"
 * Caso não bata com nenhum prefixo conhecido, aplica Title Case (fallback).
 */
export function modelo(versao: string): string {
  const v = versao.trim().toUpperCase();
  if (v.startsWith("POLO")) return "VW Polo";
  if (v.startsWith("VIRTUS EXCLUSIVE")) return "VW Virtus Exclusive";
  if (v.startsWith("VIRTUS TSI")) return "VW Virtus TSI";
  return tituloCaso(versao);
}

/** Title Case equivalente ao str.title() do Python: cada sequência de letras
 * fica com a primeira maiúscula e o resto minúsculo. Quebra em qualquer
 * caractere não-alfabético (incluindo dígitos), como o Python faz. */
export function tituloCaso(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[a-zà-ÿ]+/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** Normaliza a cor: trim + Title Case (igual titulo_cor em build.py). */
export function tituloCor(cor: string): string {
  return tituloCaso(cor);
}

/**
 * Faz o parse de um CSV com separador ';' e cabeçalho na primeira linha.
 * Lida com o BOM do utf-8-sig (removido antes do parse). Campos entre aspas
 * não ocorrem nesta fonte, então o parser é simples (split por ';').
 */
export function parseCsv(texto: string): Record<string, string>[] {
  const semBom = texto.replace(/^\uFEFF/, "");
  const linhas = semBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) return [];
  const cabecalho = linhas[0].split(";").map((c) => c.trim());
  const registros: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const celulas = linhas[i].split(";");
    const linha: Record<string, string> = {};
    cabecalho.forEach((coluna, idx) => {
      linha[coluna] = celulas[idx] ?? "";
    });
    registros.push(linha);
  }
  return registros;
}

/** Converte uma linha crua do CSV em um VeiculoParsed normalizado. */
export function parseVeiculo(row: Record<string, string>): VeiculoParsed {
  const fipe = parseInt(row["FIPE"], 10);
  const anuncio = parseInt(row["AnuncioAtacado"], 10);
  return {
    placa: row["Placa"].trim().toUpperCase(),
    versao: row["Versao"].trim(),
    modelo: modelo(row["Versao"]),
    ano: row["Ano"].trim(),
    cor: tituloCor(row["Cor"]),
    km: parseInt(row["Km"], 10),
    diasEstoque: parseInt(row["DiasEstoque"], 10),
    loja: tituloCaso(row["Loja"]),
    uf: row["UF"].trim().toUpperCase(),
    fipe,
    anuncioAtacado: anuncio,
    utilizacao: tituloCaso(row["Utilizacao"]) || "Não informada",
    empresa: tituloCaso(row["Empresa"]),
  };
}

/** Lê e normaliza todos os veículos de um texto CSV completo. */
export function parseVeiculos(csvTexto: string): VeiculoParsed[] {
  return parseCsv(csvTexto).map(parseVeiculo);
}

/** Percentual de diferença anúncio vs FIPE, igual a build.py:
 * round((anuncio - fipe) / fipe * 100, 1). Calculado na API, não persistido. */
export function dif(anuncioAtacado: number, fipe: number): number {
  return Math.round(((anuncioAtacado - fipe) / fipe) * 100 * 10) / 10;
}

/** Conta quantos veículos há por modelo. */
export function contarPorModelo(veiculos: VeiculoParsed[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const v of veiculos) {
    contagem[v.modelo] = (contagem[v.modelo] ?? 0) + 1;
  }
  return contagem;
}
