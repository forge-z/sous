# Sous Lite

Versão leve do Sous para uma cozinha doméstica: Vite, JavaScript, Fastify e
SQLite em um único container. A interface é PT-BR por padrão.

## Desenvolvimento

```bash
npm install
npm run dev
```

O frontend roda em `5173` e encaminha `/api` para o backend em `3000`.

## Produção

```bash
npm run check
docker compose up -d --build
```

O banco fica no volume `sous_lite_data`. Não há Postgres nem serviço externo.
