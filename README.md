# Sraya Fleet Management

Internal fleet management for tracking pickup trucks collecting Fresh Fruit Bunches (TBS). See `SPECIFICATION.md` for the full Phase 1 spec.

## Local development

Requires Docker with Compose.

```bash
cp .env.example .env   # already present by default; edit if you want different ports/creds
docker compose up --build
```

Services:

| Service | URL | Notes |
| --- | --- | --- |
| `db`   | `localhost:5432` | PostgreSQL 16 |
| `api`  | `http://localhost:8080` | Go Fiber + GORM. `GET /health` → `200 ok` only while the DB connection is live (`503` otherwise) |
| `web`  | `http://localhost:5173` | React + Vite + Tailwind dev server |

Each service defines a health check; `docker compose up` waits for `db` to be healthy before starting `api`.

## Configuration

All runtime config lives in `.env` (see `.env.example`). Ports and DB credentials are read by both Compose and the API container.

## Layout

```
api/   Go Fiber backend (GORM + PostgreSQL)
web/   React + Vite + Tailwind frontend
```
