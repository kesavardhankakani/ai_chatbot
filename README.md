# KK Book Store

A responsive online bookshop with searchable books, original 3D-styled jackets, a saved-books list, dedicated `/cart` and `/checkout` pages, SQLite-backed order records, and a corner-mounted `AiAssistant` powered only by Ollama on your computer.

## Local assistant

No external API key or internet connection is required for assistant replies. The app discovers installed Ollama models and defaults to `llama3.2:3b`; `gemma3:4b` is also available in this workspace. A cloud API key previously shared in chat is not used by this app; revoke it if it is still active.

## Run locally on Windows

Requirements: Python 3.10 or newer.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If `.env` does not exist, create it from `.env.example`. Otherwise, keep its existing settings and set `OLLAMA_BASE_URL=http://localhost:11434` and `OLLAMA_MODEL=llama3.2:3b`. Ensure Ollama is running and the selected model has been pulled locally.

Then start the app:

```powershell
uvicorn app:app --host 127.0.0.1 --port 8000
```

Open [http://localhost:8000](http://localhost:8000). If PowerShell blocks virtual environment activation, use `.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000`.

## Run with Docker Compose

Requirements: Docker Desktop with Compose.

1. Copy `.env.example` to `.env` if needed and confirm `OLLAMA_MODEL` is installed in Ollama.
2. Build and start the web app:

   ```powershell
   docker compose up -d --build
   ```

3. Open [http://localhost:8000](http://localhost:8000).

The Compose port is localhost-only by default. Docker Desktop reaches Windows Ollama through `host.docker.internal`; keep Ollama running on the host. SQLite order and newsletter records persist in the `bookstore-data` volume. `docker compose down` stops the service but keeps the records; `docker compose down -v` deletes them.

## Features

- Browse a 17-book catalog with category filters, search, ratings, sorting, original covers, and book detail views.
- Save favorites and keep a shopping bag in browser storage.
- Manage quantities at `/cart` and complete the delivery form at `/checkout`.
- Place orders through server-validated checkout. Prices and shipping are calculated on the server and order records persist in SQLite.
- Ask `AiAssistant` for book guidance using an installed Ollama model. Prompts go to the local Ollama service only.
- Start multiple assistant chats, reopen saved history, clear one chat, or clear all saved chats. Chat history stays in browser storage on this computer.
- Subscribe to the newsletter, with email addresses stored in SQLite.

## Prototype limitations and production checklist

This demo records orders but does not collect payment, send order-confirmation emails, or deliver newsletters. It stores customer shipping details and subscriber addresses in SQLite. There is no customer account or order-management interface. Before public deployment, add an authenticated admin workflow, an actual payment provider and email service, appropriate privacy/retention controls, HTTPS, backups, and request rate limiting. Do not expose the service publicly as-is.

Book information and sample prices are seeded in `app.py`; replace them with a maintained inventory/catalog source for a real shop. The hero photograph and typefaces are loaded from third-party image/font hosts; browsing and local assistant requests otherwise work without an external cover API.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama API base URL |
| `OLLAMA_MODEL` | `llama3.2:3b` | Preferred installed local model |
| `CHAT_PORT` | `8000` | Host port for Docker Compose |
| `BOOKSTORE_DATABASE` | `data/bookstore.sqlite3` | SQLite database path |

## Validation

```powershell
py -m unittest discover -s tests -v
node --check static/app.js
```
