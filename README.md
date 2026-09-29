# SIH26190 — Bharat Raksha AI

**Secure Digital Document Management for Legal and Investigation Documents**

**Problem Statement: SIH26190 only** — Ministry of Home Affairs (MHA) · Theme: **Smart Automation**

Optional **Smart Automation+** modules (network, copilot, court assist, etc.) run on the **same case and legal register** — they are extra capabilities for SIH26190, not a separate problem statement.

## Links

| | URL |
|---|-----|
| **GitHub (source)** | https://github.com/rohithkumar505/BharatRaksha-AI |
| **Live full stack** (UI + API + Postgres + Redis + MinIO + Neo4j + AI) | https://documentation-minus-african-constructed.trycloudflare.com — Docker on your Mac + Cloudflare tunnel |
| **Cloud deploy** (Next.js UI + API + **Supabase Postgres** — sign-in works) | https://bharat-raksha-ai.vercel.app |
| **Alignment doc** | [SIH26190_ALIGNMENT.md](./SIH26190_ALIGNMENT.md) |

**Demo login:** `investigator@bharatraksha.gov.in` / `Invest@Bharat2026!`  
**Senior officer:** `senior@bharatraksha.gov.in` / `Senior@Bharat2026!`

Start at **/sih26190** → **Legal Docs** → **Legal Command**.

## Stack

| Layer | Tech |
|-------|------|
| Web app | Next.js 15, React, TypeScript, Tailwind |
| Auth & RBAC | NextAuth (credentials), 4-tier roles, MFA hooks |
| Data | PostgreSQL + **Prisma** (`packages/database`) |
| Files | MinIO (S3-compatible vault) |
| Cache / jobs | Redis, BullMQ ingestion worker |
| Graph intel | Neo4j + GDS |
| AI | Python **FastAPI** (`services/ai`) — OCR, NER, embeddings |
| Integrity | Hash-chained `LedgerBlock`, bundle verify, BSA §63 exports |
| Infra | **Docker Compose** (dev + `docker-compose.prod.yml`) |
| CI | GitHub Actions — install, Prisma push, lint, build |

## Run locally (full platform)

```bash
npm install
docker compose up -d          # postgres, neo4j, redis, minio, ai
npm run db:push && npm run db:seed
npm run start:local           # schema sync + Next dev on :3000
```

Verify SIH26190 APIs:

```bash
npm run verify:sih26190
```

## Production-style deploy (Docker)

Set secrets in `.env` (see `docker-compose.prod.yml`), then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Set `NEXTAUTH_URL` to your public HTTPS origin.

## Public tunnel (judge demo from laptop)

With web on port 3000:

```bash
export NEXTAUTH_URL=https://<your-subdomain>.trycloudflare.com
export AUTH_TRUST_HOST=true
npm run dev
cloudflared tunnel --url http://127.0.0.1:3000
```

## Monorepo layout

- `apps/web` — Next.js UI + API routes  
- `packages/database` — Prisma schema, migrations, seed  
- `services/ai` — OCR / NLP microservice  
- `scripts/` — SIH26190 verify, step smoke tests, backups  

## Capabilities

~**54** registered SIH26190 features (`tier`: core · smart_automation · smart_automation_plus):  
`GET /api/legal-documents/capabilities` or in-app **Help → SIH26190**.
