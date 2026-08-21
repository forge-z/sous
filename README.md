# Sous

> Your kitchen has an inventory. Sous makes it useful.

Sous is an open-source, self-hosted kitchen inventory copilot. It keeps a persistent inventory, records movements, and helps decide what to cook while prioritising food that should be used first.

## v0.1

The MVP is a modular monolith using Next.js, TypeScript, PostgreSQL, Docker Compose, a deterministic command parser, an optional AI provider boundary, and a stdio MCP server.

Included:

- inventory with numeric and qualitative quantities;
- purchase, consumption, empty and history operations;
- priorities and expiry dates;
- shopping list;
- mobile-first dashboard;
- English and Portuguese-friendly commands;
- mock mode when no AI provider is configured;
- Docker healthcheck, persistent PostgreSQL volume, migrations and fictional seed data.

## Quick start

Requirements: Docker and Docker Compose.

    cp .env.example .env
    docker compose -f docker-compose.yml -f docker-compose.local.yml up -d

Open http://localhost:3000.

The local override publishes port 3000 only for development. The base Compose file intentionally has no host port mapping, which avoids collisions when deployed through Coolify.

Load fictional demo data with:

    docker compose -f docker-compose.yml -f docker-compose.local.yml exec sous npm run db:seed

## Coolify

Use `docker-compose.yml` as the Compose source in Coolify. Configure the `sous` service with container port `3000` and assign the domain in Coolify. Do not add a host port mapping such as `3000:3000`; Coolify routes the domain to the container internally, so other services may continue using host port 3000. The PostgreSQL service remains private and has no public port.

## Natural language

The command box understands examples such as:

- Bought 2 kg of chicken and six tomatoes
- Usei metade do frango
- The milk is finished
- Essa berinjela precisa ser usada logo

Writes are previewed and require confirmation before the domain transaction is applied.

## MCP

Run the stdio server with:

    docker compose run --rm sous npm run mcp

MCP tools and web routes use the same domain layer.

## Development

    npm install
    cp .env.example .env
    npm run db:migrate
    npm run dev

Checks:

    npm run lint
    npm run typecheck
    npm test
    npm run build

## Configuration and security

AI is optional. Set AI_PROVIDER, AI_BASE_URL, AI_API_KEY, and AI_MODEL for an OpenAI-compatible provider. Without them, the inventory remains usable with deterministic fallback behavior.

Keep PostgreSQL private to the Compose network. For internet exposure, use HTTPS and an authenticated reverse proxy. Never commit .env files, credentials, personal domains, Tailnet names, or real household data.

## Roadmap

Barcode scanning, receipts, computer vision, nutrition, supermarket integrations, notifications, smart speakers, native apps, multi-tenant accounts, and advanced forecasting are outside v0.1.

## License

MIT. See LICENSE.
