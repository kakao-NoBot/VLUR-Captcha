FROM node:24-alpine AS builder

WORKDIR /app

ARG PUBLIC_API_BASE=
ARG PUBLIC_SITE_KEY=pk-aicap_dev_testuser_002

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

RUN VITE_VLUR_API_BASE="${PUBLIC_API_BASE}" \
    VITE_VLUR_SITE_KEY="${PUBLIC_SITE_KEY}" \
    npm run build


FROM nginx:1.28-alpine AS runtime

ENV BACKEND_HOST=backend \
    BACKEND_PORT=8000 \
    NGINX_ENVSUBST_FILTER="^(BACKEND_HOST|BACKEND_PORT)$"

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1