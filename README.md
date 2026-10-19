# BullTracer

Plataforma open-source para monitoramento ativo e não-intrusivo de filas [BullMQ](https://docs.bullmq.io).
Entregas práticas do TCC — Sistemas de Informação, Centro Universitário Academia (UniAcademia).

O BullTracer lê o Redis do BullMQ sem exigir mudanças nas aplicações monitoradas, exibe métricas
em tempo real e dispara webhooks quando regras configuráveis são violadas.

## Estrutura

```
bulltracer/
├─ apps/
│  ├─ server/      → API REST + WebSocket + Watcher (Fastify, BullMQ, SQLite)
│  └─ dashboard/   → SPA React (Vite, TanStack Router, Zustand, Tailwind)
├─ bench/          → experimentos de validação (vazão, falhas, latência, overhead)
```

Princípio central: o **Redis é a única fonte de verdade** dos jobs; o SQLite guarda apenas
configuração (conexões, webhooks, regras de alerta).

## Requisitos

- Node.js 22.21.1+ (`.nvmrc`)
- pnpm 12+
- Docker e Docker Compose (para o deploy e o Redis de testes)

## Desenvolvimento

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev:server       # http://localhost:4000
pnpm dev:dashboard    # http://localhost:5173 (proxy para :4000)
```

Redis de testes (porta `6390`, senha `passlocal`):

```bash
docker compose --profile lab up -d redis-lab
```

Verificações:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

## Deploy (Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

Dashboard em http://localhost:8080. Cadastre o Redis a monitorar na tela **Conexões**
(use o host acessível a partir do container do servidor).

> Atenção: a versão atual **não tem autenticação**. Não exponha à internet.

## Licença

[MIT](LICENSE)
