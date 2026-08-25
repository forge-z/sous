# Sous Lite

Versão leve do Sous para uma cozinha doméstica: Vite, JavaScript, Fastify e
SQLite em um único container. A interface é PT-BR por padrão e os dados ficam
em um volume local, sem serviço externo ou chave de IA.

## Instalação com Docker

Requer Docker com Compose. Para iniciar uma instância local:

```bash
cp .env.example .env
docker compose up -d --build
```

Abra <http://localhost:3000>. Para usar outra porta no host, altere `SOUS_PORT`
no `.env` e recrie o container:

```bash
docker compose up -d --build
```

O banco SQLite é persistido no volume `sous_lite_data`. Para fazer backup,
pare a aplicação e copie o arquivo `sous.db` do volume; não remova o volume
durante atualizações.

## Desenvolvimento

```bash
npm install
npm run dev
```

O frontend roda em `5173` e encaminha `/api` para o backend em `3000`.

Em outro terminal, inicie o backend quando necessário:

```bash
npm start
```

## Produção

```bash
npm run check
docker compose up -d --build
```

O endpoint de saúde é `GET /healthz`. O banco fica no volume
`sous_lite_data`; não há Postgres nem serviço externo.
