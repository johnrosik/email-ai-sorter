# Email AI Sorter

Aplicação completa para classificar emails com Gemini: o backend Flask roda o classificador e o frontend Vite entrega a experiência visual.

## Project structure

- `backend/` – Flask API, AI logic, automated tests, and Python requirements.
- `frontend/` – React + Vite + Tailwind single-page app for interacting with the classifier.
- `render.yaml` – Render blueprint to provision the backend web service.
- `.env.example` / `frontend/.env.example` – Modelos de variáveis de ambiente para backend e frontend.
- `README.md` – This guide.

## Backend quickstart

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest
python -m backend.app
```

The API binds to `0.0.0.0` on port `8000` by default. Override host/port with the `FLASK_HOST`, `FLASK_PORT`, or `PORT` environment variables.

### Environment variables

Set either `GEMINI_API_KEY` or `GOOGLE_API_KEY` before starting the server so the classifier can call Gemini. A local `.env` file is supported via `python-dotenv`.

```bash
# backend/.env
GEMINI_API_KEY=your-key
```

### Frontend quickstart

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on `http://127.0.0.1:5173` and proxies requests directly to the backend URL configured via `VITE_API_BASE_URL` (default: `http://127.0.0.1:8000`). Copy `.env.example` to `.env` to change it.

```bash
# frontend/.env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

To produce a static production build:

```bash
npm run build
npm run preview
```

### Deploying to Render

#### Backend (Flask API)

O arquivo `render.yaml` já descreve o serviço web Python:

1. Faça push do repositório para o GitHub.
2. No Render, escolha **New → Blueprint**, informe a URL do repositório e confirme.
3. Aceite o serviço `email-ai-sorter-backend` (tipo `web`, runtime `python`, `rootDir: backend`).
4. Em **Environment → Secret Files & Variables**, defina pelo menos `GEMINI_API_KEY` (o blueprint já exporta `FLASK_DEBUG=false`).
5. Deploy: o Render executará `pip install -r requirements.txt` e iniciará `gunicorn app:app --bind 0.0.0.0:$PORT`.

#### Frontend (Vite SPA)

Crie um site estático separado apontando para a pasta `frontend/`:

1. Em **New → Static Site**, selecione o mesmo repositório.
2. Configure:
	- **Root Directory:** `frontend`
	- **Build Command:** `npm install && npm run build`
	- **Publish Directory:** `dist`
3. Adicione a variável `VITE_API_BASE_URL` com o domínio público do backend (ex.: `https://email-ai-sorter-backend.onrender.com`).
4. Deploy para publicar a SPA.

> Dica: após o backend estar ativo, copie a URL mostrada em **Dashboard → email-ai-sorter-backend → Overview** e use-a na variável do frontend.

#### Pós-deploy

- Verifique `/info` no backend para confirmar o funcionamento.
- Abra o domínio do frontend para validar uploads e classificação.
- Sempre mantenha as variáveis `.env` fora do controle de versão; use os exemplos fornecidos para replicar localmente.
