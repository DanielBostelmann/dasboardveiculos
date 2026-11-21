// Constantes de apresentação da dashboard que NÃO vêm do banco: o mapa de cores
// para os selos, a fonte do relatório e o local. Espelham o CFG gerado por
// build/build.py (cores_hex, fonte, local). Os dados dos veículos agora vêm da
// API (GET /api/veiculos); estas constantes permanecem no cliente por serem de
// pura apresentação.

export interface Registro {
  placa: string;
  versao: string;
  modelo: string;
  ano: string;
  cor: string;
  km: number;
  dias: number;
  loja: string;
  uf: string;
  fipe: number;
  anuncio: number;
  dif: number;
  utilizacao: string;
  empresa: string;
  nImagens?: number;
}

export interface ConfigDashboard {
  fonte: string;
  local: string;
  coresHex: Record<string, string>;
}

export const CONFIG: ConfigDashboard = {
  fonte: "SIMULADOR CS - GERENTE",
  local: "Porto Velho, RO",
  coresHex: {
    Branco: "#e8edf2",
    Preto: "#2b3440",
    Prata: "#c2ccd6",
    Cinza: "#8b97a5",
    Vermelho: "#d0472e",
    Azul: "#2f6fb0",
    Verde: "#2f8f6a",
  },
};
