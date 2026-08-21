# Contributing to Sous

Run npm install, copy .env.example to .env, then run npm run db:migrate and npm run dev.

Before opening a pull request, run npm run lint, npm run typecheck, npm test, and npm run build.

Keep business rules in src/lib/domain. API handlers, the UI, and MCP tools must call the shared domain layer. Never commit secrets, personal infrastructure, or real household data.
