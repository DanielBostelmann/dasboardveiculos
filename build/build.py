#!/usr/bin/env python3
"""Gera dashboard-veiculos-pv.html: um único arquivo com CSS, JS, fonte e dados fixos.

Fonte: relatório "SIMULADOR CS - GERENTE" (pátio CS Seminovos Porto Velho), em build/fonte/veiculos.csv.
Opção 2: a dashboard não acessa a internet; os dados ficam gravados no arquivo.
Uso: python3 build/build.py   (DATA_DADOS=dd/mm/aaaa muda a data mostrada; padrão: 16/11/2026, data do relatório)
"""
import base64
import csv
import json
import os
import re
from pathlib import Path

BUILD = Path(__file__).resolve().parent
FONTE = BUILD / "fonte"
DASH = BUILD / "dashboard"
OUT = BUILD.parent / "index.html"


def modelo(v):
    v = v.strip().upper()
    if v.startswith("POLO"):
        return "VW Polo"
    if v.startswith("VIRTUS EXCLUSIVE"):
        return "VW Virtus Exclusive"
    if v.startswith("VIRTUS TSI"):
        return "VW Virtus TSI"
    return v.title()


def titulo_cor(c):
    return c.strip().title()


def pct_num(s):
    return float(s.replace("%", "").replace(".", "").replace(",", ".")) if s.strip() else None


registros = []
with (FONTE / "veiculos.csv").open(encoding="utf-8-sig") as f:
    for i, row in enumerate(csv.DictReader(f, delimiter=";")):
        fipe = int(row["FIPE"])
        anuncio = int(row["AnuncioAtacado"])
        dif = round((anuncio - fipe) / fipe * 100, 1)
        registros.append({
            "placa": row["Placa"].strip().upper(),
            "versao": row["Versao"].strip(),
            "modelo": modelo(row["Versao"]),
            "ano": row["Ano"].strip(),
            "cor": titulo_cor(row["Cor"]),
            "km": int(row["Km"]),
            "dias": int(row["DiasEstoque"]),
            "loja": row["Loja"].strip().title(),
            "uf": row["UF"].strip().upper(),
            "fipe": fipe,
            "anuncio": anuncio,
            "dif": dif,
            "utilizacao": (row["Utilizacao"].strip().title() or "Não informada"),
            "empresa": row["Empresa"].strip().title(),
        })

placas = [r["placa"] for r in registros]
assert len(placas) == len(set(placas)), "placas duplicadas"
# confere o % do relatório
with (FONTE / "veiculos.csv").open(encoding="utf-8-sig") as f:
    for r, row in zip(registros, csv.DictReader(f, delimiter=";")):
        rel = pct_num(row["AnuncioxFIPE"])
        if rel is not None:
            assert abs(rel - r["dif"]) <= 0.1, (r["placa"], rel, r["dif"])

cores_hex = {"Branco": "#e8edf2", "Preto": "#2b3440", "Prata": "#c2ccd6", "Cinza": "#8b97a5",
             "Vermelho": "#d0472e", "Azul": "#2f6fb0", "Verde": "#2f8f6a"}
data = os.environ.get("DATA_DADOS") or "16/11/2026"
loja = registros[0]["loja"] if registros else "Pátio CS Seminovos Porto Velho"
cfg = {
    "data": data,
    "fonte": "SIMULADOR CS - GERENTE",
    "loja": loja,
    "local": "Porto Velho, RO",
    "coresHex": cores_hex,
    "registros": registros,
}
cfg_json = json.dumps(cfg, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def data_uri(path, mime):
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


css = (DASH / "app.css").read_text(encoding="utf-8").replace("{{FONT}}", data_uri(BUILD / "NotoSans-subset.ttf", "font/ttf"))
js = (DASH / "app.js").read_text(encoding="utf-8")
assert "</script" not in js.lower()
html = (DASH / "template.html").read_text(encoding="utf-8")
html = (html.replace("{{CSS}}", css).replace("{{CFG}}", cfg_json).replace("{{JS}}", js))
OUT.write_text(html, encoding="utf-8")

import collections
mod = collections.Counter(r["modelo"] for r in registros)
esperado = {
    "total": len(registros),
    "porModelo": dict(mod),
    "porCor": dict(collections.Counter(r["cor"] for r in registros)),
    "somaAnuncio": sum(r["anuncio"] for r in registros),
    "somaFipe": sum(r["fipe"] for r in registros),
    "kmMax": max(r["km"] for r in registros),
    "fipePorModelo": {m: sorted({r["fipe"] for r in registros if r["modelo"] == m}) for m in mod},
}
(DASH / "esperado.json").write_text(json.dumps(esperado, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"OK: {OUT.name} ({OUT.stat().st_size // 1024} KB) · {len(registros)} veículos · modelos {dict(mod)}")
