---
name: frontend-designer
description: >
  Use this skill when building any UI for VaultGate — the institutional yield vault
  dashboard, deposit flow, portfolio view, audit log, admin panel, or any marketing
  page. Enforces a refined, institutional-grade aesthetic that communicates security
  and trust without feeling like generic fintech. Avoids AI-slop defaults (Inter,
  purple gradients, card-soup layouts). Triggers on: "build the dashboard", "design
  the deposit page", "make the UI", "style the component", "build the frontend".
license: MIT
---

# VaultGate frontend designer skill

## The design brief

VaultGate serves institutional finance professionals at banks like AMINA Bank — people
who use Bloomberg terminals, not consumer apps. The UI must communicate three things
instantly: **security**, **precision**, and **yield**. It should feel like a private
banking interface, not a DeFi farm.

The Demo Day audience in Zurich includes Swiss banking executives. The UI is part of
the pitch. Every screen they see must make them think "this is production-ready" not
"this is a hackathon project."

---

## Aesthetic direction: Refined institutional dark

**The concept**: A Bloomberg terminal crossed with a Swiss watchmaker's spec sheet.
Dense information, immaculate typography, surgical grid. Dark background with precise
data visualisation. No gradients, no glassmorphism, no "crypto bro" aesthetics.

**Reference points**:
- Bloomberg Terminal data density, but legible
- Robeco / Pictet private bank report typography
- Ledger Live app's dark, security-focused palette
- Physical Swiss franc banknote's micro-typography and grid discipline

**What makes this UNFORGETTABLE**: The grid. Every element snaps to an 8px baseline
grid. Columns align. Numbers right-justify to the decimal point. Amounts use monospace
numerals so commas and decimals stack perfectly. It feels like a professional
instrument, not a website.

---

## Color palette

```css
:root {
  /* Backgrounds — layered dark surfaces */
  --bg-base:     #0A0C0F;   /* page background — near-black, not pure black */
  --bg-surface:  #111318;   /* card surfaces */
  --bg-elevated: #181C23;   /* modals, dropdowns */
  --bg-hover:    #1E2330;   /* interactive hover state */

  /* Borders — very subtle on dark */
  --border-dim:    rgba(255,255,255,0.06);
  --border-mid:    rgba(255,255,255,0.12);
  --border-strong: rgba(255,255,255,0.22);

  /* Text — four-level hierarchy */
  --text-primary:   #F0F2F5;   /* headings, key numbers */
  --text-secondary: #8B93A5;   /* labels, captions */
  --text-muted:     #4B5368;   /* placeholders, disabled */
  --text-inverse:   #0A0C0F;   /* text on light badges */

  /* Accent — one sharp green, nothing else */
  --accent:         #00D68F;   /* yield numbers, success states, CTAs */
  --accent-dim:     rgba(0, 214, 143, 0.12);
  --accent-border:  rgba(0, 214, 143, 0.35);

  /* Semantic */
  --danger:         #FF4D4D;
  --danger-dim:     rgba(255, 77, 77, 0.12);
  --warning:        #F5A623;
  --warning-dim:    rgba(245, 166, 35, 0.12);

  /* Yield glow — used sparingly for APY displays */
  --yield-glow: 0 0 20px rgba(0, 214, 143, 0.15);
}
```

**Rules**:
- Background is always `--bg-base`. Never white. Never light mode.
- The ONLY accent color is `--accent` (green). No blue CTAs, no purple gradients.
- Use green exclusively for: yield figures, connected/verified states, success actions.
- Red only for: sanctions, rejections, errors. Not for "danger" styling of neutral actions.
- No additional accent colors. Discipline is the aesthetic.

---

## Typography

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

:root {
  --font-sans:  'IBM Plex Sans', sans-serif;
  --font-mono:  'IBM Plex Mono', monospace;
}
```

**Why IBM Plex**: Designed by IBM for data-dense interfaces. The mono variant is
exceptional for financial numbers — it has tabular figures built in, so columns of
amounts align perfectly without CSS tricks. It reads as "engineered, precise" not
"creative, playful" — exactly right for institutional finance.

**Type scale**:
```
Display (vault name, hero APY): 48px / 300 weight / --font-sans
Heading 1 (page title):         24px / 500 weight / --font-sans
Heading 2 (section title):      16px / 500 weight / --font-sans / letter-spacing: 0.08em / UPPERCASE
Body:                           14px / 400 weight / --font-sans / line-height: 1.6
Caption / label:                12px / 400 weight / --font-sans / --text-secondary
Data / amounts:                 varies / 500 weight / --font-mono (ALWAYS mono for numbers)
```

**Critical rule**: Every financial figure (balances, APY, amounts, timestamps) must use
`font-family: var(--font-mono)`. This is non-negotiable. Mixed-width numerals in a
financial UI look amateurish and break column alignment.

---

## Layout system

**Grid**: 12-column, 24px gutters, 40px outer margin on desktop. On mobile: 4-column,
16px gutters. Use CSS Grid, not flexbox, for page-level layout.

**8px baseline grid**: Every vertical spacing value must be a multiple of 8px.
Padding: 8, 16, 24, 32, 40, 48, 64px. Never 10, 15, 20, 25px.

**Sidebar layout** (dashboard):
```
┌──────────────────────────────────────────────────┐
│  NAV (64px wide, fixed, dark)  │  MAIN CONTENT   │
│                                 │  (fluid)        │
│  Logo                           │                 │
│  ─────                          │  ┌────────────┐ │
│  Overview                       │  │ STAT CARDS │ │
│  Deposit                        │  └────────────┘ │
│  Portfolio                      │  ┌────────────┐ │
│  Audit Log                      │  │ DATA TABLE │ │
│  ─────                          │  └────────────┘ │
│  [KYC Badge]                    │                 │
│  [Wallet]                       │                 │
└──────────────────────────────────────────────────┘
```

---

## Component patterns

### Stat card (for AUM, APY, depositor count)
```jsx
// Pattern: label top, number bottom, accent border-left for positive metrics
<div style={{
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-dim)',
  borderLeft: '2px solid var(--accent)',  // accent left rail = positive metric
  borderRadius: 4,
  padding: '16px 20px',
}}>
  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--text-secondary)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
    Current APY
  </div>
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500,
                color: 'var(--accent)', boxShadow: 'var(--yield-glow)' }}>
    6.84%
  </div>
</div>
```

### KYC status badge
```jsx
// Three states: verified, unverified, expired
const kycStyles = {
  verified:   { bg: 'var(--accent-dim)',   border: 'var(--accent-border)',   color: 'var(--accent)',   label: 'KYC Verified' },
  unverified: { bg: 'var(--danger-dim)',   border: 'rgba(255,77,77,0.35)',   color: 'var(--danger)',   label: 'Not Verified' },
  expired:    { bg: 'var(--warning-dim)',  border: 'rgba(245,166,35,0.35)',  color: 'var(--warning)',  label: 'KYC Expired'  },
};

<div style={{
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 10px', borderRadius: 2,
  background: style.bg,
  border: `1px solid ${style.border}`,
}}>
  <span style={{ width: 6, height: 6, borderRadius: '50%', background: style.color }} />
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: style.color,
                 letterSpacing: '0.05em' }}>
    {style.label}
  </span>
</div>
```

### Data table (for audit log, depositor list)
```jsx
// Tight rows, monospace amounts, right-aligned numbers, subtle hover
<table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
  <thead>
    <tr style={{ borderBottom: '1px solid var(--border-mid)' }}>
      {/* Headers: uppercase, 11px, --text-secondary, letter-spacing */}
      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11,
                   color: 'var(--text-secondary)', letterSpacing: '0.08em',
                   textTransform: 'uppercase', fontWeight: 400 }}>
        Wallet
      </th>
      <th style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        Amount (USDC)
      </th>
    </tr>
  </thead>
  <tbody>
    {rows.map(row => (
      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-dim)',
                                 transition: 'background 0.1s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {row.wallet}  {/* Truncate: first 6...last 4 chars */}
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                     color: row.type === 'deposit' ? 'var(--accent)' : 'var(--text-primary)' }}>
          {row.type === 'deposit' ? '+' : '-'}{row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

### Deposit input
```jsx
// Precision input — no browser number spinners, right-aligned amount
<div style={{ position: 'relative', background: 'var(--bg-elevated)',
              border: '1px solid var(--border-mid)', borderRadius: 4,
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12,
                 color: 'var(--text-secondary)', minWidth: 60 }}>USDC</span>
  <input
    type="number"
    placeholder="0.00"
    style={{
      flex: 1, background: 'none', border: 'none', outline: 'none',
      fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500,
      color: 'var(--text-primary)', textAlign: 'right',
      appearance: 'none', MozAppearance: 'textfield',
    }}
  />
</div>
```

### Primary CTA button
```jsx
// Only ONE primary button per view. Square corners (not rounded). Uppercase label.
<button style={{
  background: 'var(--accent)',
  color: 'var(--text-inverse)',
  border: 'none',
  borderRadius: 2,   // nearly square — intentional. Rounded buttons = consumer apps.
  padding: '12px 32px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'opacity 0.15s',
}}>
  Deposit
</button>
// Hover: opacity 0.85. Disabled: opacity 0.3, cursor not-allowed.
```

---

## Animations — surgical, not decorative

**Philosophy**: One animation per user action. No idle animations. No looping effects.
Transitions should communicate state change, not entertain.

```css
/* Page load: staggered fade-up for stat cards */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stat-card { animation: fadeUp 0.3s ease forwards; }
.stat-card:nth-child(1) { animation-delay: 0ms; }
.stat-card:nth-child(2) { animation-delay: 60ms; }
.stat-card:nth-child(3) { animation-delay: 120ms; }

/* KYC verified pulse — once only, on status change */
@keyframes verifiedPulse {
  0%   { box-shadow: 0 0 0 0 rgba(0, 214, 143, 0.4); }
  70%  { box-shadow: 0 0 0 8px rgba(0, 214, 143, 0); }
  100% { box-shadow: none; }
}

/* Number count-up for APY and balance — use JS, CSS transition on opacity */
/* Don't use CSS counters — use a simple requestAnimationFrame count-up */
```

**Never use**: Rotating spinners on content (use skeleton screens instead).
Parallax. Scroll-triggered reveals on data tables. Hover "lift" shadows (this is dark
theme — shadows don't work). Background particle effects. Looping APY counter.

---

## Specific screen specs

### Dashboard overview
- Left sidebar: 240px fixed, `--bg-surface`, shows wallet address (truncated mono),
  KYC badge, jurisdiction + tier, navigation links
- Top stat row: 3 cards — Total Deposited, Current APY, Vault Utilisation (progress bar)
- Main area: Yield over time sparkline (use Recharts, no axes, just the line + current value)
- Below: Recent transactions table (last 10, with type badges)

### Deposit flow
- Single-focus screen — no sidebar distractions
- Step indicator: 3 steps (Connect → Verify KYC → Deposit), horizontal, mono dots
- Amount input (see component above)
- Below input: live yield preview — "At 6.84% APY, $10,000 earns ~$684/yr"
- Slippage/fee summary in a bordered box before confirm
- Confirmation: transaction hash in mono, Solana Explorer link

### Audit log
- Full-width table, dense rows (44px each)
- Columns: Timestamp | Action | Amount | Tx Hash | Status
- Status pill: green for Confirmed, amber for Pending, red for Failed
- Export button (top right): download as CSV

### KYC gate screen (shown when wallet not verified)
- Centred card, dark background, no sidebar
- Large status indicator at top (red X → orange spinner → green check)
- Explains: "Your Fireblocks identity has not been verified for this vault"
- Shows jurisdiction requirements
- Contact link for AMINA Bank onboarding team

---

## What NOT to build

- Light mode. This vault is dark-only. No toggle.
- Glassmorphism or frosted blur effects. This is 2026 — that's dated.
- Rainbow gradient "Web3" headers. Institutional clients will leave.
- Mascots, illustrations, or decorative SVG art. Data only.
- Mobile-first responsive layout (this is a desktop institutional tool; mobile is low priority for demo day).
- Toast notifications that pile up. One notification at a time, top-right, auto-dismiss at 4s.
- Skeleton loaders that pulse rainbow. Use `--bg-hover` shimmer only.

---

## Quick checklist before shipping any screen

- [ ] Every financial number uses `var(--font-mono)` — no exceptions
- [ ] Amounts right-align to decimal point in tables
- [ ] KYC status visible on every authenticated screen (sidebar or header)
- [ ] Positive flow (deposit success, yield accruing) uses `--accent` green only
- [ ] No more than one primary CTA button visible at a time
- [ ] Stat cards have `border-left: 2px solid var(--accent)` for positive metrics
- [ ] All transitions are `0.15s ease` or `0.3s ease` — nothing slower
- [ ] Demo mode (`NEXT_PUBLIC_DEMO_MODE=true`) shows realistic fake data, not zeroes
- [ ] Wallet address displayed as `0x1234...5678` truncated monospace, never full
- [ ] Tx hashes link to `https://explorer.solana.com/tx/{hash}?cluster=devnet`
