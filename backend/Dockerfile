FROM node:20
WORKDIR /app

# Dependencias del sistema (Puppeteer/Chromium) — capa en caché si no cambia
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

# Solo package*.json primero → npm ci en capa en caché (mientras no cambien deps)
COPY package.json package-lock.json ./
RUN npm ci

# Código y build (esta capa se invalida al cambiar solo el código)
COPY . .
RUN npm run build
# Must listen on PORT (Railway injects it) and 0.0.0.0
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "run", "start"]
