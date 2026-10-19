# bench

Geradores de carga para validar o BullTracer. Usam o Redis de testes por padrão
(`docker compose --profile lab up -d redis-lab`, porta 6390, senha `passlocal`).

## Producer

```bash
pnpm --filter @bulltracer/bench producer --count 1000 --rate 100
```

| Flag | Padrão | Descrição |
|---|---|---|
| `--count` | 1000 | Total de jobs, somando todas as filas |
| `--rate` | 0 | Jobs por segundo no total (0 = o mais rápido possível) |
| `--distribution` | even | Como repartir entre as filas: `even` (round-robin) ou `random` |
| `--remove-on-complete` | desligado | Remove jobs concluídos do Redis |

## Consumer

```bash
pnpm --filter @bulltracer/bench consumer --fail-rate 30 --concurrency 10
```

| Flag | Padrão | Descrição |
|---|---|---|
| `--fail-rate` | 0 | Porcentagem (0–100) de jobs que falham, sorteados por job. Aceita `fila=valor` por fila |
| `--process-ms` | 50 | Tempo simulado de processamento. Aceita `fila=valor` por fila |
| `--concurrency` | 1 | Jobs em paralelo, por fila |

O consumer imprime o progresso a cada segundo e o total ao receber Ctrl+C.

## Cenário caótico (várias filas)

Três filas com perfis diferentes: uma saudável, uma instável e uma quase quebrada.

```bash
pnpm --filter @bulltracer/bench consumer --queues orders,emails,reports \
  --fail-rate orders=5,emails=30,reports=60 \
  --process-ms orders=5,emails=20,reports=80 --concurrency 10

pnpm --filter @bulltracer/bench producer --queues orders,emails,reports \
  --count 3000 --rate 300 --distribution random
```

## Flags comuns

`--queue` (bench-queue), `--queues a,b,c` (substitui `--queue`), `--host`, `--port`, `--username`, `--password`, `--help`.
Também aceitam as variáveis `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME` e `REDIS_PASSWORD`.
