FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --ignore-scripts=false

COPY frontend/ ./
RUN npm run build

# ── Production runtime ──────────────────────────────────
FROM nginx:alpine

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Ensure nginx cache/pid dirs are writable
RUN chown -R nginx:nginx /var/cache/nginx /var/run /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

USER nginx

CMD ["nginx", "-g", "daemon off;"]
