# Rosiak Classifier

> Classificação inteligente de e-mails com Gemini, Flask e uma SPA moderna em React.

## Visão geral

O Email AI Sorter recebe anexos ou corpo de e-mails, envia o conteúdo para o Gemini e classifica automaticamente o tipo de mensagem. O objetivo é acelerar triagens de atendimento, automatizar workflows e entregar insights em segundos.

## Principais funcionalidades

- Upload e leitura de e-mails em PDF/Texto para classificação por IA.
- API REST em Flask que organiza prompts e chamadas ao Gemini.
- SPA responsiva em React, com animações suaves e feedback em tempo real.
- Pipeline pronto para deploy em Render (backend Python + site estático Vite).

## Stack principal

| Camada | Tecnologias |
| --- | --- |
| Backend | Python 3.11+, Flask, Flask-CORS, google-generativeai, python-dotenv, pytest |
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS, Headless UI, Heroicons, Framer Motion, GSAP |
| Infra | Render Blueprint (`render.yaml`), variáveis `.env`, Gunicorn |

## Arquitetura em alto nível

```
frontend/ (SPA) ──► chama ──► backend/ (Flask API) ──► Gemini
```

- `frontend/` consome a API para enviar e-mails e exibir o resultado.
- `backend/` prepara o prompt, chama o Gemini via `google-generativeai` e retorna a classificação.

## Pré-requisitos

- Python 3.11 ou superior
- Node.js 18+ (ou compatível com Vite 5)
- Chave de API do Gemini (`GEMINI_API_KEY` ou `GOOGLE_API_KEY`)

## Como rodar localmente

### Backend (Flask)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m pytest
python -m backend.app
```

> **macOS/Linux:** troque a ativação do ambiente virtual por `source .venv/bin/activate`.

A API sobe em `http://127.0.0.1:8000` por padrão. Ajuste `FLASK_HOST`, `FLASK_PORT` ou `PORT` se necessário.

### Frontend (Vite + React)

```powershell
cd frontend
npm install
npm run dev
```

O Vite roda em `http://127.0.0.1:5173` e encaminha requisições para o backend definido em `VITE_API_BASE_URL` (padrão: `http://127.0.0.1:8000`).

Para gerar o build de produção:

```powershell
npm run build
npm run preview
```

## Variáveis de ambiente

Crie arquivos `.env` a partir dos exemplos existentes:

```bash
# backend/.env
export GEMINI_API_KEY="sua-chave"

# frontend/.env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Outras variáveis úteis no backend:

- `FLASK_HOST` e `FLASK_PORT` para sobrescrever host/porta locais.
- `PORT` (Render, Railway etc.) para respeitar a porta dinâmica.

## Testes automatizados

- Backend: `python -m pytest`
- Frontend: `npm run lint`

Recomendado executar os testes antes de abrir PRs ou fazer deploy.

