FROM node:22-alpine AS builder
WORKDIR /app

COPY shared /app/shared
COPY idle-backend /app/idle-backend

RUN npm ci --prefix /app/shared
RUN npm run --prefix /app/shared build
RUN npm ci --prefix /app/idle-backend
RUN npm run --prefix /app/idle-backend build
RUN npm prune --prefix /app/idle-backend --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/idle-backend/package.json /app/package.json
COPY --from=builder /app/idle-backend/package-lock.json /app/package-lock.json
COPY --from=builder /app/idle-backend/node_modules /app/node_modules
COPY --from=builder /app/shared /shared
COPY --from=builder /app/idle-backend/dist /app/dist
COPY --from=builder /app/idle-backend/sql /app/sql

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
