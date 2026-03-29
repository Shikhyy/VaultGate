# AGENTS.md — VaultGate

> This file defines the AI agent roles, responsibilities, boundaries, and coordination
> protocol for building VaultGate. Every agent (human or AI) working on this codebase
> must read this file before touching any code.

---

## Project context

VaultGate is a KYC-gated yield vault on Solana. Institutions verified through Fireblocks
identity management can deposit USDC/EURC into permissioned vaults and earn yield routed
through Kamino and Marginfi. Compliance is enforced on-chain via Solana Token Extensions
(Transfer Hook, Permanent Delegate). This is a StableHacks hackathon submission targeting
the AMINA Bank $100k pilot track.

**Hackathon deadline:** 10 days from kickoff.  
**Demo Day:** Zurich (top 10 teams). Live contract required.

---

## Agent roster

### Agent 1 — Anchor Architect
**Role:** Smart contract lead  
**Model hint:** Use a coding-focused model with Solana/Rust context  
**Owns:**
- `programs/vault-core/` — vault deposit, withdraw, yield routing
- `programs/kyc-hook/` — Transfer Hook program enforcing whitelist
- `programs/access-registry/` — on-chain KYC whitelist PDA store
- All `tests/` for on-chain programs (Bankrun or Anchor test framework)

**Must NOT touch:**
- Frontend (`app/`)
- Off-chain oracle service (`oracle/`)
- Fireblocks integration layer (`integrations/fireblocks/`)

**Coordination rules:**
- Exposes PDA schema in `docs/pda-schema.md` after every structural change
- Pins IDL to `target/idl/` — frontend agent pulls from there, never hard-codes
- Tags breaking IDL changes with `[IDL-BREAK]` in commit message
- All accounts must have `#[account(constraint = ...)]` — no silent failures

---

### Agent 2 — KYC Oracle Engineer
**Role:** Off-chain oracle service connecting Fireblocks identity to on-chain whitelist  
**Model hint:** Use a backend/Node.js-focused model  
**Owns:**
- `oracle/` — Node.js service (Fastify)
- `oracle/src/fireblocks.ts` — Fireblocks SDK wrapper
- `oracle/src/whitelist-syncer.ts` — writes verified addresses to `access-registry` PDA
- `oracle/src/webhooks.ts` — receives Fireblocks KYC status change events

**Must NOT touch:**
- Smart contract source (`programs/`)
- Frontend (`app/`)

**Coordination rules:**
- Reads PDA schema from `docs/pda-schema.md` — never assumes account layout
- Uses only the `ORACLE_KEYPAIR` (non-upgrade authority) for signing whitelist writes
- Emits structured logs to `oracle/logs/` — one JSON line per whitelist action
- All Fireblocks API calls wrapped in circuit-breaker (3 retries, exponential backoff)
- Never stores raw KYC data — stores only: `{wallet, jurisdiction, tier, verified_at_unix}`

---

### Agent 3 — Frontend Engineer
**Role:** React/Next.js dashboard for institutional depositors  
**Model hint:** Use a frontend-focused model with Tailwind/Next.js context  
**Owns:**
- `app/` — Next.js 14 app router
- `app/components/` — vault UI, deposit flow, yield dashboard
- `app/hooks/` — Solana wallet adapter, vault state hooks
- `app/lib/idl.ts` — imports IDL from `target/idl/` (read-only)

**Must NOT touch:**
- Smart contracts (`programs/`)
- Oracle service (`oracle/`)
- Fireblocks backend integration

**Coordination rules:**
- Pulls IDL from `target/idl/` — never writes it
- Watches for `[IDL-BREAK]` commits — regenerates client types immediately
- Uses `@coral-xyz/anchor` client — no raw `@solana/web3.js` instruction building
- All RPC calls go through `app/lib/rpc.ts` (single configurable endpoint)
- Demo mode flag: `NEXT_PUBLIC_DEMO_MODE=true` uses mock vault state for Zurich demo

---

### Agent 4 — DevOps / Test Orchestrator
**Role:** CI, deployment, integration tests, localnet coordination  
**Model hint:** Use a general-purpose model  
**Owns:**
- `.github/workflows/`
- `scripts/` — deploy, seed, smoke-test scripts
- `docker-compose.yml` — localnet + oracle + app stack
- `docs/` — architecture diagrams, PDA schema, runbooks

**Must NOT touch:**
- Business logic in any layer

**Coordination rules:**
- Runs `anchor test` in CI on every PR to `main`
- Maintains `scripts/seed-localnet.sh` — sets up test vault + KYC'd wallets
- Owns the `devnet` and `mainnet-beta` deploy keys (hardware wallet)
- All secrets in `.env.example` — never in source

---

## Coordination protocol

### Branch strategy
```
main              → protected, requires passing CI + 1 review
dev               → integration branch, all agents merge here first
feat/anchor-*     → Agent 1 branches
feat/oracle-*     → Agent 2 branches
feat/frontend-*   → Agent 3 branches
feat/ops-*        → Agent 4 branches
```

### Shared state contract

The only shared truth between agents is:

| Artifact | Owner | Consumers |
|---|---|---|
| `target/idl/*.json` | Agent 1 | Agent 3 |
| `docs/pda-schema.md` | Agent 1 | Agent 2, Agent 3 |
| `oracle/logs/` | Agent 2 | Agent 4 (monitoring) |
| `.env.example` | Agent 4 | All |

### Daily sync (async — post to `#vaultgate-build` channel)
```
[Agent N] [Date]
DONE: <what was shipped>
BLOCKED: <blockers, tag the agent who owns the blocker>
NEXT: <next 4 hours>
IDL-CHANGED: yes/no
```

### Error escalation
- Smart contract panic → Agent 1 owns, unblocks Agent 3 within 2 hours
- Oracle webhook failure → Agent 2 owns, Agent 4 monitors
- Frontend RPC errors → Agent 3 first, escalate to Agent 4 if RPC-level

---

## Hard constraints (all agents)

1. **No private keys in source.** Ever. Not even test keys committed.
2. **All token operations use Token Extensions.** No legacy SPL Token program.
3. **Every vault action emits an on-chain event** (`emit!` macro) — audit trail requirement.
4. **No `unwrap()` in production paths** — return `Result<_, VaultError>` everywhere.
5. **Jurisdiction check before every deposit** — vault rejects wallets outside allowed list.
6. **Demo Day stability:** `main` branch must be deployable to devnet at all times from Day 5.

---

## Security model

```
Trust hierarchy:
  Upgrade Authority (hardware wallet, Agent 4 holds)
    └── Vault Admin (AMINA Bank multisig in production)
          └── Oracle Keypair (Agent 2 service, write-only to whitelist)
                └── Depositor (KYC-verified institution wallet)
```

No single key controls both the vault funds AND the whitelist. These are separate authority
chains by design. If the oracle is compromised, an attacker can add/remove addresses from
the whitelist but cannot drain vault funds (requires Vault Admin for configuration changes).

---

## Definition of done (hackathon scope)

- [ ] Vault accepts USDC deposits from whitelisted wallets on devnet
- [ ] Non-whitelisted wallets are rejected at Transfer Hook level (not just UI)
- [ ] Yield routing to Kamino mock (or real Kamino devnet) demonstrated
- [ ] Oracle syncs a Fireblocks webhook → on-chain whitelist within 30 seconds
- [ ] Frontend shows deposit, balance, and yield APY
- [ ] Demo script in `scripts/demo-day.sh` runs end-to-end in under 3 minutes
- [ ] Audit log of all vault actions queryable from frontend
