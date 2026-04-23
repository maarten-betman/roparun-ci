# Multi-stage production build: Vite → nginx static serve + API/WS proxy.
#
# Build context is the REPO ROOT (not frontend/), because the Hulp page
# imports the Dutch handbook straight from ../docs/gebruik/*.md via Vite
# `?raw`. We mirror the repo layout inside the container so those
# relative imports resolve identically in dev and prod.
FROM node:22-alpine AS build
WORKDIR /repo/frontend

# Install deps with a clean lockfile-based install for reproducibility.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build-time MapTiler key is optional; the demotiles fallback keeps the map
# working when it's unset.
ARG VITE_MAPTILER_KEY=""
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY

# The SPA talks to /api and /ws on the *same origin* — nginx proxies them to
# the backend container in the same compose network.
ENV VITE_API_BASE=/api

# Bring in the handbook source first so Vite can resolve the `?raw`
# imports in src/hulp/Hulp.tsx (`../../../docs/gebruik/*.md?raw`).
COPY docs /repo/docs
# Then the frontend workspace on top of node_modules.
COPY frontend ./

RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
