FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
ENV NODE_ENV=production
ENV SKIP_MAINLAND_RUNTIME=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib/mainland ./lib/mainland
COPY --from=builder /app/lib/step19 ./lib/step19
COPY --from=builder /app/lib/step20 ./lib/step20
COPY --from=builder /app/lib/step20-1 ./lib/step20-1
COPY --from=builder /app/lib/step20-2 ./lib/step20-2
COPY --from=builder /app/lib/step20-3 ./lib/step20-3
COPY --from=builder /app/lib/step21 ./lib/step21
COPY --from=builder /app/lib/step21-1 ./lib/step21-1
COPY --from=builder /app/lib/step21-2 ./lib/step21-2
COPY --from=builder /app/lib/step21-3 ./lib/step21-3
COPY --from=builder /app/lib/step21-5 ./lib/step21-5
COPY --from=builder /app/lib/step21-6 ./lib/step21-6
COPY --from=builder /app/lib/step21-7 ./lib/step21-7
COPY --from=builder /app/tests/v21-7-definitions.test.mjs ./tests/v21-7-definitions.test.mjs
COPY --from=builder /app/tests/v21-5-presentation.test.mjs ./tests/v21-5-presentation.test.mjs
COPY --from=builder /app/tests/v21-2-speech.test.mjs ./tests/v21-2-speech.test.mjs
COPY --from=builder /app/lib/cloud/knowledge-chunks.jsonl.gz.b64 ./lib/cloud/knowledge-chunks.jsonl.gz.b64
RUN mkdir -p /app/.data/storage /app/backups \
    && chmod 0755 /app/lib /app/lib/cloud \
    && chmod 0644 /app/lib/cloud/knowledge-chunks.jsonl.gz.b64 \
    && chown -R nextjs:nodejs /app/.data /app/backups
USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]
