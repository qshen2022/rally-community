# Rally · Tennis practice

A shared tennis practice board for your own group. Players can create sessions, join or leave, add friends to open slots, and join a waitlist. When a place opens, the earliest waiting signup is promoted automatically.

WhatsApp sharing includes concise signup changes, today's upcoming games, and other sessions with vacancies. Player names share one line, such as **Morgan, Riley · 2 open slots**. Today uses Pacific time and a game is listed only once.

**This is an independent, source-only template.** It contains database schema migrations, but no existing users, signups, name claims, database files, credentials, Site project binding or Git history from an existing deployment. A new installation starts empty.

- [中文安装与部署教程](docs/DEPLOY.zh-CN.md)
- [English deployment guide](docs/DEPLOY.md)
- [Architecture and safety boundaries](docs/ARCHITECTURE.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Quick start

Use Node.js 24 LTS. Clone or download this repository into a new directory:

```sh
npm run setup -- --owner-email owner@example.com
npm ci
npm run build
npm run db:local
npm run dev
```

Use the local URL printed by the development server. Local development has a local-only sign-in stub; it is not ChatGPT production authentication. The setup owner must match the actual ChatGPT sign-in email for your **new** hosted board. Apple relay addresses may differ from your usual email.

`setup` only configures local files. `db:local` always passes `--local` and creates/migrates only the checkout's local database. Neither command contacts an existing Rally deployment or deploys a Site.

## Host your own board

Create a **new Site in your own ChatGPT account** using Sites and the checked-out repository. Supply this instruction:

> Build a new Site from this Rally repository in my account. Create a new project and a fresh DB binding. Do not reuse any existing Site ID, database, sign-in client or previous owner's data. Configure the owner using my ChatGPT sign-in email. Preserve the source and publish under my account. Follow docs/DEPLOY.md.

The Sites workflow registers the new project, provisions its isolated D1 database and sign-in integration, applies schema migrations, and publishes it. If you use a Space, place the new Site in **your own** Space; you do not need access to the original author's Space. Availability of Sites and Space attachment depends on your account. A repository URL alone is not an automatic deployment or a public ChatGPT app listing.

The generated hostname belongs to the new deployment/account. The app builds its shared links from its current origin; it never links to an author's personal board.

## Validation

```sh
npm test
npx tsc --noEmit
npm run check:export
```

`check:export` checks the **unconfigured generic template** before publishing source. After configuring a real owner or a new Site ID, it will deliberately fail until that instance-specific configuration is cleared in a separate publication copy. Do not clear a working deployment's configuration to publish source.

## What is included

- Public board viewing; ChatGPT sign-in for changes.
- Configurable session capacity; confirmed and tentative players occupy places.
- Capacity-checked signups and automatic waitlist promotion in a transaction.
- One permanent claimed name per account; organizers manage their sessions.
- Any signed-in player may add another player to an open slot; attribution and adder removal rights are retained.
- Board owner controls for signups and permanent name bindings.
- Calendar export and WhatsApp message preparation. You choose the recipient and send the message yourself.

This manages practice sessions, not actual tennis court reservations. A public ChatGPT chat integration/MCP server and automated message delivery are not implemented in this release.
