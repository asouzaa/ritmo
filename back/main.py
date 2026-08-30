import json
from datetime import date
from math import isfinite
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Ritmo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.100.160:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HABITS = [
    {"id": "bed", "title": "Arrumar a cama", "meta": "Começar o dia com intenção", "icon": "◒", "color": "sage"},
    {"id": "phone", "title": "Manhã sem celular", "meta": "Primeiros 30 min protegidos", "icon": "◌", "color": "lavender"},
    {"id": "read", "title": "Ler 10 páginas", "meta": "Leitura diária", "icon": "✦", "color": "peach"},
    {"id": "study", "title": "Estudar por 1h", "meta": "Uma sessão de foco", "icon": "⌁", "color": "blue"},
    {"id": "questions", "title": "Resolver 20 questões", "meta": "Praticar para fixar", "icon": "⊹", "color": "yellow"},
    {"id": "run", "title": "Corrida", "meta": "Meta de 3 sessões por semana", "icon": "↗", "color": "mint"},
    {"id": "strength", "title": "Musculação", "meta": "Meta de 4 sessões por semana", "icon": "◆", "color": "rose"},
]

ARQUIVO_DADOS = Path(__file__).with_name("dados.json")
TRAVA_DADOS = Lock()
IDS_HABITOS = {habit["id"] for habit in HABITS}


class ProgressoHabito(BaseModel):
    pages: float | None = Field(default=None, ge=0)
    minutes: float | None = Field(default=None, ge=0)
    quantity: float | None = Field(default=None, ge=0)


def salvar_dados(dados):
    arquivo_temporario = ARQUIVO_DADOS.with_suffix(".tmp")
    arquivo_temporario.write_text(
        json.dumps(dados, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    arquivo_temporario.replace(ARQUIVO_DADOS)


def carregar_dados():
    if not ARQUIVO_DADOS.exists():
        dados = {"concluidos_por_data": {}, "progresso_por_data": {}}
        salvar_dados(dados)
        return dados

    try:
        dados = json.loads(ARQUIVO_DADOS.read_text(encoding="utf-8"))
    except json.JSONDecodeError as erro:
        raise RuntimeError("O arquivo dados.json contém JSON inválido") from erro

    if not isinstance(dados.get("concluidos_por_data"), dict):
        raise RuntimeError("O arquivo dados.json possui estrutura inválida")

    dados.setdefault("progresso_por_data", {})
    if not isinstance(dados["progresso_por_data"], dict):
        raise RuntimeError("O arquivo dados.json possui progresso inválido")

    return dados


def obter_habitos(data_referencia: date):
    data_iso = data_referencia.isoformat()
    with TRAVA_DADOS:
        dados = carregar_dados()
        concluidos = dados["concluidos_por_data"].get(data_iso, [])
        progresso = dados["progresso_por_data"].get(data_iso, {})

    return {
        "date": data_iso,
        "habits": HABITS,
        "completed": sorted(concluidos),
        "progress": progresso,
    }


def validar_habito(habit_id: str):
    if habit_id not in IDS_HABITOS:
        raise HTTPException(status_code=404, detail="Hábito não encontrado")


def alternar_habito(data_referencia: date, habit_id: str):
    validar_habito(habit_id)

    data_iso = data_referencia.isoformat()
    with TRAVA_DADOS:
        dados = carregar_dados()
        concluidos = set(dados["concluidos_por_data"].get(data_iso, []))
        if habit_id in concluidos:
            concluidos.remove(habit_id)
        else:
            concluidos.add(habit_id)
        dados["concluidos_por_data"][data_iso] = sorted(concluidos)
        salvar_dados(dados)
        progresso = dados["progresso_por_data"].get(data_iso, {})

    return {"completed": sorted(concluidos), "progress": progresso}


def atualizar_progresso(
    data_referencia: date,
    habit_id: str,
    progresso: ProgressoHabito,
):
    validar_habito(habit_id)
    valores = progresso.model_dump(exclude_none=True)
    if not valores:
        raise HTTPException(
            status_code=422,
            detail="Informe ao menos um valor de progresso",
        )
    if any(not isfinite(valor) or valor < 0 for valor in valores.values()):
        raise HTTPException(
            status_code=422,
            detail="Os valores de progresso devem ser números não negativos",
        )

    data_iso = data_referencia.isoformat()
    with TRAVA_DADOS:
        dados = carregar_dados()
        progresso_da_data = dados["progresso_por_data"].setdefault(data_iso, {})
        progresso_do_habito = progresso_da_data.setdefault(habit_id, {})
        progresso_do_habito.update(valores)
        salvar_dados(dados)

    return obter_habitos(data_referencia)


@app.get("/api/habits/{data_referencia}")
def listar_habitos(data_referencia: date):
    return obter_habitos(data_referencia)


@app.post("/api/habits/{data_referencia}/{habit_id}/toggle")
def toggle_habito_por_data(data_referencia: date, habit_id: str):
    return alternar_habito(data_referencia, habit_id)


@app.patch("/api/habits/{data_referencia}/{habit_id}/progress")
def atualizar_progresso_por_data(
    data_referencia: date,
    habit_id: str,
    progresso: ProgressoHabito,
):
    return atualizar_progresso(data_referencia, habit_id, progresso)


@app.get("/api/today")
def get_today():
    return obter_habitos(date.today())


@app.post("/api/today/{habit_id}/toggle")
def toggle_habit(habit_id: str):
    return alternar_habito(date.today(), habit_id)


@app.patch("/api/today/{habit_id}/progress")
def atualizar_progresso_de_hoje(
    habit_id: str,
    progresso: ProgressoHabito,
):
    return atualizar_progresso(date.today(), habit_id, progresso)
