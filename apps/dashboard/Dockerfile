# BullTracer Dashboard — build a partir da RAIZ do monorepo:
#   docker build -f apps/dashboard/Dockerfile .
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/
COPY bench/package.json bench/
RUN pnpm install --frozen-lockfile --filter @bulltracer/dashboard...
COPY apps/dashboard apps/dashboard
RUN pnpm --filter @bulltracer/dashboard build

FROM nginx:1.27-alpine
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 80
