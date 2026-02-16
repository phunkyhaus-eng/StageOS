FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN corepack pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
# Copy full installed workspace (including per-package node_modules links)
# so filtered package scripts can resolve their local toolchain binaries.
COPY --from=deps /app/ ./
COPY . .
RUN corepack pnpm --filter @stageos/shared build
RUN corepack pnpm --filter @stageos/api prisma:generate
RUN corepack pnpm --filter @stageos/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
