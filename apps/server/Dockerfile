# BullTracer Server — build a partir da RAIZ do monorepo:
#   docker build -f apps/server/Dockerfile .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
COPY bench/package.json bench/
RUN pnpm install --frozen-lockfile --filter @bulltracer/server...
COPY apps/server apps/server
RUN pnpm --filter @bulltracer/server build \
 && pnpm --filter @bulltracer/server deploy --prod --legacy /out

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /repo/apps/server/dist ./dist
# SQLite local (configurações) — volume persistente para o self-host.
VOLUME ["/app/data"]
EXPOSE 4000
CMD ["node", "dist/index.js"]
