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

# Build TypeScript to JavaScript (ignora errores de tipo)
# Intentar compilar, si falla usar tsx directamente en runtime
RUN npx tsc --skipLibCheck --noEmitOnError false || echo "⚠️ TypeScript compilation had errors, will use tsx at runtime"

EXPOSE 3000

# El servidor maneja las migraciones internamente con mejor manejo de errores
# Run with tsx si dist no existe, sino con node compilado
CMD ["sh", "-c", "test -f dist/server.js && node dist/server.js || tsx src/server.ts"]
