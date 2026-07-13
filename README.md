# ideal-octo-bassoon

A simple webapp for prompting and generating images with OpenAI's image API (`gpt-image-1`).

- `backend/` — FastAPI server that calls OpenAI server-side (your API key never reaches the browser)
- `frontend/` — Vite + React UI

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv venv          # already created if you followed along
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and set your key:

```
OPENAI_API_KEY=sk-...
```

Run the server:

```bash
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Notes

- `backend/.env` is gitignored — never commit real API keys.
- If you ever paste an API key into a chat, ticket, or log, treat it as compromised and rotate it at https://platform.openai.com/api-keys.
