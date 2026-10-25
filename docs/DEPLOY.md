# Deploy a separate Rally for your group

Each group runs its own Site, database, owner configuration and sign-in integration. Sharing code does not share runtime data.

1. Use Node.js 24 LTS and clone into a new directory.
2. Run `npm run setup -- --owner-email owner@example.com` with the new owner's ChatGPT sign-in email. Only the SHA-256 hash is saved. Setup refuses an already-bound checkout or existing owner configuration and never accesses a database.
3. Run `npm ci`, `npm run build`, `npm run db:local`, and `npm run dev` to develop locally. Local development uses a localhost-only mock sign-in. The migration script always uses `--local` and a fixed local placeholder database; it does not support production migration.
4. In the new owner's ChatGPT account, ask Sites to create a **new** Site from this repository. Use the newly returned project ID, not any existing Site. Keep `d1: "DB"` in `.openai/hosting.json`. The supported Sites workflow provisions a new database and trusted authentication gateway, applies the schema migrations and publishes the new Site. Use your own Space if attaching it to a Space is available.
5. Verify the board is empty, the owner has admin controls, ordinary users cannot change permanent name ownership, concurrent signups respect capacity, waitlists promote and WhatsApp links point to the new origin.

Do not copy an existing production database, project ID, Site credential, identity client or repository history. No data export is needed to install this application.

A plain clone is not a deployment. You need Sites access in the destination account; this repository does not bundle a platform deployment API key. Generated hostnames are chosen by the platform for the new account. No author-specific URL is embedded in the application.

When updating your own instance, preserve its owner configuration, project ID and runtime database. For a reusable source release, prepare a separate clean publication copy and run `npm run check:export`; never sanitize a live checkout in place.

## Hosting boundaries

Production identity is provided by the Sites gateway. A raw Worker on a generic host is not a complete authentication deployment; an independent OAuth/session integration would be required. Never trust identity headers received directly from the public Internet. Local mock auth is restricted by the bundled development plugin to loopback traffic and is not production auth.

The application currently uses Pacific time. WhatsApp preparation requires the visitor to select recipients and send. Court booking, automatic messaging and a publicly distributed ChatGPT chat/MCP integration are separate, unimplemented features.
