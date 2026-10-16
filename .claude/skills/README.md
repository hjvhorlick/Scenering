# Paddle agent skills (vendored)

These are Paddle's own agent skills, copied unmodified from
[paddlehq/paddle-agent-skills](https://github.com/paddlehq/paddle-agent-skills)
at commit `70cb70d` (2026-10-16), so that any AI agent opening this repository
gets Paddle's current integration guidance instead of guessing from training
data. They are instructions for agents — not application code, not build
output — and nothing in `src/` or `server/` imports them.

Installed in both canonical locations, the way the `skills` CLI does it:

| Location | Read by |
|---|---|
| `.agents/skills/` | Cursor, Codex, GitHub Copilot, Zed, Amp, Replit and other universal-format tools |
| `.claude/skills/` | Claude Code |

Each directory is named after its skill's frontmatter `name` (`paddle-webhooks`,
not `webhooks`), which is what the CLI uses, so re-running the installer updates
these in place rather than duplicating them.

**Licence:** Apache-2.0, © Paddle. The full upstream licence text is kept in
`LICENSE.paddle-agent-skills` next to the skills, as that licence requires. See
also `DEVELOPMENT_LICENSES.md` in the repository root.

## What is here

| Skill | Covers |
|---|---|
| `paddle-catalog-setup` | creating the products and prices everything else depends on |
| `paddle-webhooks` | the delivery contract, signature verification, idempotency, retries |
| `paddle-subscription-sync` | mirroring subscription and customer state into a database |
| `paddle-checkout-web` | overlay/inline Paddle Checkout with Paddle.js |
| `paddle-customer-portal` | minting hosted customer-portal session URLs |
| `paddle-subscription-cancel` | cancel-at-end-of-period flows |
| `paddle-subscription-update` | upgrades, downgrades and proration |
| `paddle-billing-history` | listing a customer's transactions and invoices |
| `paddle-pricing-pages` | country-localised price previews |
| `paddle-sandbox-testing` | test cards, the webhook simulator, tunnels |
| `paddle-usage-based-billing` | usage-based billing (early access) |

The skills' examples are written for Next.js and Supabase. Scenering is an
Express app on a Cloudflare Worker with D1, so the *patterns* transfer and the
code does not: `server/platform.ts` implements the same contract by hand, and
`PADDLE.md` records where the two differ and why.

## Updating

From a machine that can reach both npm and `developer.paddle.com`:

```bash
npx skills add https://developer.paddle.com/
```

Or, without npm — the CLI is only a downloader, and the skills live on GitHub:

```bash
git clone --depth 1 https://github.com/paddlehq/paddle-agent-skills.git /tmp/pas
cp -r /tmp/pas/skills/. .agents/skills/   # then rename each dir to its frontmatter name
```

Then commit the result and update the commit reference at the top of this file.
