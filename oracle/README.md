# VaultGate KYC Oracle Service

> Off-chain service that bridges Fireblocks identity verification to Solana on-chain whitelist.

## Overview

The oracle receives Fireblocks KYC webhook events, verifies their authenticity,
and writes verified wallet addresses to the on-chain `AccessRegistry` program.
This enables the Transfer Hook to enforce KYC compliance on every token transfer.

```
Fireblocks Webhook → Oracle (verify + validate) → Solana AccessRegistry PDA
```

## Architecture

```
┌──────────────────────────────────────────┐
│ Fireblocks Identity API                  │
│  → KYC status changed                   │
│  → Webhook POST to /webhook/fireblocks   │
└──────────┬───────────────────────────────┘
           │
┌──────────▼───────────────────────────────┐
│ Oracle Service (Fastify)                 │
│                                          │
│  webhooks.ts  → Verify ECDSA signature   │
│              → Validate payload (Zod)    │
│              → Enqueue event             │
│                                          │
│  queue.ts     → Durable file-backed queue│
│              → Auto-retry with backoff   │
│              → Deduplication             │
│                                          │
│  whitelist-   → Derive WalletRecord PDA  │
│  syncer.ts   → Send Anchor transaction   │
│              → Audit log every action    │
│                                          │
│  fireblocks.  → Circuit-breaker (3×)     │
│  ts          → Exponential backoff       │
└──────────┬───────────────────────────────┘
           │
┌──────────▼───────────────────────────────┐
│ Solana Devnet                            │
│  AccessRegistry Program                 │
│  WalletRecord PDAs                      │
└──────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Install dependencies
cd oracle
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start in mock mode (no real Solana/Fireblocks)
MOCK_MODE=true npm run dev

# 4. Test with a webhook
curl -X POST http://localhost:3001/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "7ZmP...test", "status": "APPROVED", "jurisdiction": "CH", "tier": 2}'
```

## API Endpoints

### `GET /health`

Health check endpoint. Returns service status, queue stats, and uptime.

```json
{
  "status": "healthy",
  "mockMode": true,
  "queue": { "total": 5, "pending": 0, "synced": 5, "failed": 0 },
  "fireblocks": "connected",
  "uptime": 123.45,
  "timestamp": "2026-03-29T12:00:00.000Z"
}
```

### `POST /webhook/fireblocks`

Production webhook endpoint. Requires `fireblocks-signature` header.

**Headers:**
- `fireblocks-signature` — ECDSA signature (base64)

**Body:**
```json
{
  "type": "KYC_STATUS_CHANGED",
  "data": {
    "walletAddress": "7ZmP...base58",
    "status": "APPROVED",
    "jurisdiction": "CH",
    "tier": 2
  }
}
```

### `POST /webhook/test`

Test endpoint (MOCK_MODE only). No signature required.

```json
{
  "walletAddress": "7ZmP...base58",
  "status": "APPROVED",
  "jurisdiction": "CH",
  "tier": 2
}
```

## Project Structure

```
oracle/
├── src/
│   ├── server.ts           # Main entrypoint — Fastify server
│   ├── config.ts           # Environment variable validation (Zod)
│   ├── types.ts            # Type definitions & webhook schemas
│   ├── webhooks.ts         # Webhook routes + signature verification
│   ├── fireblocks.ts       # Fireblocks SDK wrapper (circuit-breaker)
│   ├── whitelist-syncer.ts # On-chain PDA writer
│   ├── queue.ts            # Durable event queue (file-backed)
│   ├── anchor-client.ts    # Solana/Anchor client + stub IDL
│   └── logger.ts           # Structured JSON audit logging
├── logs/                   # Structured audit logs (one JSON line per action)
├── data/                   # Persistent queue state
├── tests/                  # Vitest unit tests
├── .env.example            # Environment variable template
├── package.json
└── tsconfig.json
```

## Security

- **Webhook signatures** are verified using ECDSA/SHA512 before processing
- **Oracle keypair** has write-only access to whitelist PDAs — cannot touch vault funds
- **No raw KYC data** is stored — only wallet, jurisdiction, tier, timestamps
- **No private keys in source** — all keys loaded from environment variables
- **Circuit-breaker** prevents cascading failures from Fireblocks API issues

## Coordination

- Reads PDA schema from `docs/pda-schema.md` — never assumes account layout
- Emits structured logs to `oracle/logs/` — one JSON line per whitelist action
- Uses stub IDL until Agent 1 deploys `access-registry` program
- Environment variables documented in `.env.example`
