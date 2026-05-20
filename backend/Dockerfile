FROM node:20-bookworm-slim AS build
WORKDIR /app

# Railway services have historically used both `backend` and `/backend` as
# rootDirectory values. Normalize the source tree so this image builds with
# either a backend-root context or a repository-root context.
COPY . /src
RUN if [ -f /src/backend/package.json ]; then \
      cp -a /src/backend/. /app/; \
    else \
      cp -a /src/. /app/; \
    fi
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    npm_config_audit=false \
    npm_config_fund=false
RUN npm ci --ignore-scripts

RUN npm run build
RUN npm prune --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Runtime libraries used by Puppeteer/Chromium-compatible flows. Keeping them
# out of the build stage avoids Railway builder ENOSPC during `prisma generate`.
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  wget \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

# Must listen on PORT (Railway injects it) and 0.0.0.0
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "run", "start"]
