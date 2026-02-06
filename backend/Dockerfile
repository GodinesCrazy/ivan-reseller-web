FROM node:20-alpine

# Instalar herramientas de compilación necesarias para módulos nativos (bcrypt, etc.)
RUN apk add --no-cache \
    openssl \
    python3 \
    make \
    g++ \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && ln -sf python3 /usr/bin/python

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy Prisma schema BEFORE npm install (needed for postinstall hook)
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build and runtime)
# NO ignorar scripts para que bcrypt y otros módulos nativos se compilen correctamente
RUN npm install

# Copy source code
COPY src ./src

# Generate Prisma Client (no DB connection needed for generation)
RUN npx prisma generate

# Build: prisma generate + tsc - must succeed for deployment
RUN npm run build

EXPOSE 4000

# Phase 8: Run compiled JS only - no tsx, nodemon, or dev watchers in production
# Migrations run first via start:with-migrations
CMD ["npm", "run", "start:with-migrations"]
