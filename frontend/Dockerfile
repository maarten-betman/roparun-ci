# Multi-stage production build: Vite → nginx static serve + API/WS proxy.
FROM node:22-alpine AS build
WORKDIR /app

# Install deps with a clean lockfile-based install for reproducibility.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build-time MapTiler key is optional; the demotiles fallback keeps the map
# working when it's unset.
ARG VITE_MAPTILER_KEY=""
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY

# The SPA talks to /api and /ws on the *same origin* — nginx proxies them to
# the backend container in the same compose network.
ENV VITE_API_BASE=/api

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
