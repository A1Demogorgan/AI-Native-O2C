# Agentic O2C POC

Local-first Order-to-Cash proof of concept built with Next.js, DuckDB, and OpenAI Agents SDK.

## Features

- Cash Application agent: allocate payments to open invoices.
- Dispute Triage agent: classify disputes and generate evidence summary.
- Collections Strategy agent: generate prioritized outreach actions.
- Order Capture agent: mailbox-driven email + PDF order capture with human-in-the-loop validation before posting.
- O2C Control Tower dashboard: KPI visibility (DSO proxy, dispute rate, auto match rate, unapplied cash).

## Tech

- Next.js 16 (App Router + TypeScript)
- DuckDB embedded database (`data/o2c.duckdb`)
- `openai`, `@openai/agents`, `@openai/agents-openai`
- `zod` validation
- `@faker-js/faker` synthetic data seeding

## Setup

```bash
npm install
npm run reset-db
npm run init-db
npm run seed-data
npm run dev
```

Open `http://localhost:3000`.

## API Endpoints

- `GET /api/customers`
- `GET /api/invoices`
- `GET /api/payments`
- `GET /api/disputes`
- `POST /api/payments/import`
- `POST /api/disputes`
- `GET /api/kpis`
- `GET /api/collections`
- `POST /api/collections/actions`
- `POST /api/agents/cash-application`
- `POST /api/agents/dispute-triage`
- `POST /api/agents/collections-strategy`
- `POST /api/agents/order-capture/email`
- `POST /api/agents/order-capture/chat`
- `POST /api/agents/order-capture/extract`
- `GET /api/order-capture/mailboxes`
- `POST /api/order-capture/pull-latest`
- `POST /api/order-capture/approve`
- `GET /api/orders`
- `GET /api/agents/kpis`

## Notes

- Agent routes include deterministic fallback logic so they work without `OPENAI_API_KEY`.
- If `OPENAI_API_KEY` is set, the app attempts to run through OpenAI Agents SDK.
- All write actions generate event log entries.
