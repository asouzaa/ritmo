# ritmo

Planejamento diário de estudos, hábitos saudáveis e dopamina limpa.

O repositório segue a arquitetura do `monitora-voos`:

- `back/`: scripts e API Python. O estado local fica em JSON; a evolução prevista é exportar dados para planilha e JSON público.
- `front/`: aplicação React/Vite.
- `testes/`: testes do backend e verificações do contrato do frontend.
- `docs/`: artefato estático gerado para o GitHub Pages.
- `.github/workflows/`: automação de build e publicação.

## Desenvolvimento local

Backend:

```bash
cd back
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend, em outro terminal:

```bash
cd front
npm install
npm run dev
```

## Testes

```bash
python -m unittest discover -s testes -v
cd front && npm run build
```

## Publicação gratuita

O workflow em `.github/workflows/publicar.yml` gera o build do React, coloca o resultado em `docs/` e publica no GitHub Pages. O backend Python não é executado no Pages; para manter o site gratuito, o frontend publicado deve consumir dados estáticos exportados pelo `back/` ou persistir o acompanhamento no navegador.

No GitHub, configure `Settings → Pages → Source: GitHub Actions`.
