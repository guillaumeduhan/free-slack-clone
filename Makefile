# Slack clone · Next.js 16 + PostgreSQL
.DEFAULT_GOAL := dev
.PHONY: help dev install reset smoke typecheck lint build lan tunnel clean

help:  ## List targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

node_modules: package.json package-lock.json
	npm install
	@touch node_modules

install: node_modules  ## Install dependencies

dev: node_modules  ## Run everything (Postgres + migrations + app) on http://localhost:3002
	npm run dev

reset: node_modules  ## Drop the chat schema, migrate and seed (needs the database running, e.g. during make dev)
	npm run db:reset

smoke: node_modules  ## End-to-end API check (make dev must be running)
	npm run smoke

typecheck: node_modules  ## TypeScript check
	npm run typecheck

lint: node_modules  ## ESLint
	npm run lint

build: node_modules  ## Production build
	npm run build

lan:  ## http://slack.localhost here, http://slack.local on the Wi-Fi (with make dev running)
	npm run lan

tunnel:  ## Public https URL via Cloudflare quick tunnel (needs cloudflared)
	cloudflared tunnel --no-autoupdate --url http://localhost:3002

clean:  ## Delete the embedded database (all local data)
	rm -rf .data
