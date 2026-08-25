# Sous Lite

Versão leve do Sous para uma cozinha doméstica: Vite, JavaScript, Fastify e
SQLite em um único container. A interface é PT-BR por padrão e os dados ficam
em um volume local, sem serviço externo ou chave de IA.

## Execução local com Docker

Requer Docker com Compose. Para iniciar uma instância local:

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Abra <http://localhost:3000>. Para usar outra porta no host, altere `SOUS_PORT`
no `.env` e recrie o container:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

O banco SQLite é persistido no volume `sous_data`. Para fazer backup,
pare a aplicação e copie o arquivo `sous.db` do volume; não remova o volume
durante atualizações.

## Deploy no Coolify

Use `docker-compose.yml` como o Compose da aplicação. O arquivo base não
publica portas no host: o Coolify/Traefik deve encaminhar o domínio para a
porta interna `3000` do serviço. Não inclua `docker-compose.local.yml` no
deploy do Coolify, pois ele publica `3000` no host e pode colidir com o proxy.

O volume persistente é `sous_data`. Não remova volumes antigos durante uma
atualização; eles contêm o banco SQLite da instalação.

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
```

O endpoint de saúde é `GET /healthz`. O banco fica no volume
`sous_data`; não há Postgres nem serviço externo.
