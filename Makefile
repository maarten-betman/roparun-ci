.PHONY: dev up down logs migrate revision seed test lint typecheck backend-test frontend-test backend-lint frontend-lint

dev: up
	@echo "API:    http://localhost:8000/healthz"
	@echo "Web:    http://localhost:5173"
	@echo "Track:  http://localhost:5173/tracker.html"

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose exec api alembic upgrade head

revision:
	@test -n "$(m)" || (echo "usage: make revision m='description'" && exit 1)
	docker compose exec api alembic revision --autogenerate -m "$(m)"

seed:
	docker compose exec api python -m app.scripts.seed

load-roparun-2026:
	docker compose exec api python -m app.scripts.load_roparun_2026

test: backend-test frontend-test

backend-test:
	cd backend && pytest -q

frontend-test:
	cd frontend && npm run test

lint: backend-lint frontend-lint

backend-lint:
	cd backend && ruff check . && ruff format --check .

frontend-lint:
	cd frontend && npm run lint

typecheck:
	cd backend && mypy app
	cd frontend && npm run typecheck
