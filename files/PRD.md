# Product Requirements Document — VaultGate
**Version:** 1.0  
**Status:** Approved for hackathon build  
**Owner:** VaultGate team  
**Last updated:** March 2026

---

## 1. Executive summary

VaultGate is a KYC-gated institutional yield vault built on Solana. It enables regulated
financial institutions — banks, asset managers, family offices — to deploy stablecoin
liquidity into DeFi yield sources while satisfying their compliance obligations under
MiCA, FATF, and Swiss FINMA frameworks.

The compliance layer is enforced **on-chain** via Solana Token Extensions (Transfer Hook),
not as an off-chain promise. This is the core technical differentiator: an institution's
legal or compliance team can verify the enforcement mechanism by reading the hook program,
not by trusting a counterparty.

**Primary target:** AMINA Bank institutional pilot ($100k prize track at StableHacks)  
**Secondary targets:** Fireblocks partner prize, Solana Foundation adoption prize

---

## 2. Problem statement

### 2.1 The institutional DeFi gap

Institutional capital cannot access DeFi yield without a compliant wrapper. The blockers:

- **Permissionless by default.** Standard DeFi protocols accept any wallet. An institution
  depositing to Aave or Kamino directly cannot guarantee counterparties are KYC'd.
- **Off-chain compliance is fragile.** Existing "institutional DeFi" products enforce
  rules at the UI layer or API layer. A sophisticated actor can bypass both.
- **Audit trail requirements.** Institutional compliance teams need an immutable,
  on-chain log of every transfer, for whom, under which jurisdiction rules.
- **Jurisdiction complexity.** A single vault must support multi-jurisdiction depositors
  with different rules (e.g. CH allows all tiers; US allows tier-3 only).

### 2.2 User pain (AMINA Bank profile)

AMINA Bank holds client stablecoin assets (USDC, EURC) in custody. Those assets earn 0%
while idle. The treasury team cannot put them into public DeFi without breaching their
FINMA obligations. VaultGate is the compliant wrapper that closes this gap.

---

## 3. Goals and non-goals

### Goals (hackathon scope)
- Permissioned USDC/EURC vault on Solana devnet with live Transfer Hook enforcement
- Fireblocks-to-on-chain KYC sync pipeline (webhook → oracle → whitelist PDA)
- Kamino yield routing (or mock APY accumulator with Kamino integration path documented)
- Institutional dashboard: deposit, withdraw, live balance, yield APY, audit log
- Demo-day ready: end-to-end demo script under 3 minutes on devnet

### Non-goals (post-hackathon)
- Multi-vault factory (one vault per institution configuration)
- Governance token or DAO structure
- Mainnet deployment and real capital
- Mobile app
- Retail / consumer-facing features

---

## 4. User stories

### Institutional depositor
- As an institution, I want to connect my Fireblocks-managed wallet and see whether I
  am KYC verified for this vault, so I know before attempting a deposit.
- As an institution, I want to deposit USDC and see my position accrue yield in real time,
  so I can demonstrate treasury utilisation to my board.
- As an institution, I want to withdraw my principal plus yield at any time, so I am not
  locked into a fixed term.
- As a compliance officer, I want a downloadable audit log of all vault transactions tied
  to my institution, so I can satisfy regulatory reporting obligations.

### Vault administrator (AMINA Bank)
- As the vault admin, I want to set a deposit cap per vault, so I can control total
  exposure during the pilot.
- As the vault admin, I want to pause deposits without pausing withdrawals, so I can
  manage inflows while protecting depositor liquidity.
- As the vault admin, I want to configure allowed jurisdictions per vault, so different
  vaults can serve different regulatory environments.
- As the vault admin, I want to see total AUM, number of depositors, and current yield
  routed in a single dashboard view.

### Compliance / KYC team
- As the KYC team, I want verified wallet records to expire and require re-verification,
  so stale KYC data cannot be exploited.
- As the KYC team, I want sanctioned addresses to be blocked at the on-chain level even
  if a UI bug were to exist, so our OFAC obligations are met at the protocol layer.

---

## 5. Functional requirements

### 5.1 Smart contracts

**FR-SC-01** The vault program must reject deposits from wallets not present in the
on-chain AccessRegistry with an active, non-expired record. Rejection occurs at the
Transfer Hook level, not the deposit instruction level.

**FR-SC-02** The vault must support USDC (6 decimals) and EURC (6 decimals) using the
Token Extensions (Token 2022) program. Legacy SPL Token mints must not be accepted.

**FR-SC-03** Every deposit, withdrawal, and yield distribution must emit an on-chain event
(`emit!` macro) containing: wallet, amount, vault_id, action_type, timestamp.

**FR-SC-04** The vault admin must be able to set: deposit_cap (u64), min_deposit (u64),
allowed_jurisdictions (Vec<[u8;2]>), is_paused (bool), yield_strategy (enum).

**FR-SC-05** A WalletRecord PDA must store: wallet (Pubkey), jurisdiction ([u8;2]), tier
(u8), verified_at (i64), expires_at (i64), is_sanctioned (bool). The hook must check
is_sanctioned and expires_at on every transfer.

**FR-SC-06** Withdrawal must be available at all times regardless of vault pause state.
Pausing only halts new deposits.

### 5.2 KYC oracle

**FR-OR-01** The oracle service must receive Fireblocks webhook events for KYC status
changes and write the result to the on-chain WalletRecord PDA within 30 seconds.

**FR-OR-02** The oracle must verify the Fireblocks ECDSA webhook signature before
processing any event.

**FR-OR-03** The oracle must never store raw KYC documents. It may store only:
wallet address, jurisdiction code, tier, verified_at timestamp, expires_at timestamp.

**FR-OR-04** The oracle must emit a structured JSON log for every whitelist write,
including the transaction signature, for audit trail purposes.

**FR-OR-05** The oracle must handle Fireblocks API downtime gracefully: queue events,
retry with exponential backoff, alert after 3 consecutive failures.

### 5.3 Frontend

**FR-FE-01** The connect wallet screen must display KYC status (verified / unverified /
expired) before the user attempts any vault action.

**FR-FE-02** The deposit screen must show: current vault APY, vault utilisation (deposits
/ cap), minimum deposit, and expected annual yield on entered amount.

**FR-FE-03** The portfolio screen must show per-depositor: principal deposited, accrued
yield, time since deposit, current value, jurisdiction/tier badge.

**FR-FE-04** The audit log screen must list all on-chain events for the connected wallet,
with transaction signature links to Solana Explorer.

**FR-FE-05** The admin dashboard must show: total AUM, depositor count, 7-day and 30-day
yield distributed, vault utilisation, and a depositor list with KYC status.

---

## 6. Non-functional requirements

**NFR-01 Security:** No single keypair controls both vault funds and the KYC whitelist.
These are separate authority hierarchies.

**NFR-02 Latency:** KYC webhook → on-chain sync must complete within 30 seconds under
normal Solana network conditions.

**NFR-03 Auditability:** All vault actions must be reconstructible from on-chain events
alone — no reliance on off-chain database for audit purposes.

**NFR-04 Resilience:** Oracle service must operate correctly after a restart without
losing pending KYC sync events (use a durable queue or idempotent retry).

**NFR-05 Demo stability:** Devnet deployment must sustain a live demo for 10 minutes
without RPC errors. Use a private RPC endpoint (Helius, QuickNode) for demo day.

---

## 7. Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│                    SOLANA DEVNET                          │
│                                                           │
│  ┌─────────────┐    CPI    ┌─────────────────────┐      │
│  │  vault-core │ ────────► │  kyc-hook (Transfer  │      │
│  │  program    │           │  Hook program)        │      │
│  └──────┬──────┘           └──────────┬───────────┘      │
│         │ reads                        │ reads            │
│         ▼                              ▼                  │
│  ┌──────────────────────────────────────────────┐        │
│  │         access-registry program               │        │
│  │   WalletRecord PDAs (one per verified wallet) │        │
│  └──────────────────────┬───────────────────────┘        │
│                         │ writes (oracle keypair)         │
└─────────────────────────│───────────────────────────────┘
                          │
              ┌───────────▼──────────┐
              │   Oracle Service      │
              │   (Node.js/Fastify)   │
              └───────────┬──────────┘
                          │ webhooks
              ┌───────────▼──────────┐
              │   Fireblocks          │
              │   Identity API        │
              └──────────────────────┘

              ┌──────────────────────┐
              │   Next.js Frontend    │
              │   (Vercel)           │
              │   reads on-chain      │
              │   via Anchor client  │
              └──────────────────────┘
```

---

## 8. Success metrics (hackathon demo)

| Metric | Target |
|---|---|
| Non-whitelisted deposit rejection | 100% at hook level |
| KYC sync latency (webhook → chain) | < 30 seconds |
| Deposit success rate (whitelisted) | 100% on devnet |
| Demo script duration | < 3 minutes |
| Frontend load time | < 2 seconds |
| Judge questions answered by on-chain data | > 80% |

---

## 9. Open questions

1. **Kamino devnet availability:** Is Kamino's devnet market active? If not, ship mock
   yield and document the mainnet integration path clearly.
2. **Fireblocks sandbox:** Confirm access to Fireblocks sandbox environment for webhook
   testing without real KYC data.
3. **EURC mint on devnet:** EURC may need to be minted manually on devnet using the
   Token Extensions program — confirm with Circle or use a test mint.
4. **Multi-jurisdiction in demo:** For demo day, show CH and one other jurisdiction
   (e.g. DE) with different tier requirements to demonstrate jurisdiction config.
