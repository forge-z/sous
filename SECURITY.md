# Security

Please report security issues privately to the maintainers instead of opening a public issue.

Keep PostgreSQL on the private Compose network. Put Sous behind HTTPS and an authenticated reverse proxy when exposed to the internet. Store AI credentials only in environment variables. Treat backups as sensitive because they contain household inventory data.

v0.1 keeps authentication intentionally small for self-hosted installations. LAN and Tailnet deployments can use a trusted reverse proxy; public deployments should add an identity-aware proxy before exposing write endpoints.
