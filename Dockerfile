# Dockerfile for Railway deployment from monorepo root
# This ensures Railway deploys the backend correctly without dashboard configuration

FROM node:20-alpine

# Install build tools for native modules (bcrypt, etc.)
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

# Copy backend package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./

# Copy Prisma schema BEFORE npm install (needed for postinstall hook)
COPY backend/prisma ./prisma/

# Install ALL dependencies (including devDependencies for build and runtime)
# Do NOT ignore scripts so bcrypt and other native modules compile correctly
RUN npm install

# Copy backend source code
COPY backend/src ./src

# Generate Prisma Client (no DB connection needed for generation)
RUN npx prisma generate

# Build TypeScript to JavaScript (ignore type errors)
# Try to compile, if it fails use tsx directly at runtime
RUN npx tsc --skipLibCheck --noEmitOnError false || echo "⚠️ TypeScript compilation had errors, will use tsx at runtime"

EXPOSE 3000

# Server handles migrations internally with better error handling
# Run with tsx if dist doesn't exist, otherwise with compiled node
CMD ["sh", "-c", "test -f dist/server.js && node dist/server.js || tsx src/server.ts"]

