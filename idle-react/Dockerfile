FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY shared /app/shared
COPY idle-react /app/idle-react

RUN npm ci --prefix /app/shared
RUN npm run --prefix /app/shared build
RUN npm ci --prefix /app/idle-react
RUN npm run --prefix /app/idle-react build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY --from=builder /app/idle-react/dist /usr/share/nginx/html
COPY idle-react/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
