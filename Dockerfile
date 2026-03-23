FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM deps AS builder
ENV APP_ENV=production
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novel_tools?schema=public
ENV BETTER_AUTH_SECRET=docker-build-secret-0123456789abcdef
ENV BETTER_AUTH_URL=http://localhost:3000
ENV APP_BASE_URL=http://localhost:3000
ENV ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/knowledge ./knowledge
COPY --from=builder /app/scripts ./scripts

RUN sed -i 's/\r$//' /app/scripts/docker-entrypoint.sh \
  && chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

CMD ["/app/scripts/docker-entrypoint.sh"]
