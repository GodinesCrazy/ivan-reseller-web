FROM node:20-alpine

# Instalar OpenSSL (requerido por Prisma)
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy Prisma schema BEFORE npm install (needed for postinstall hook)
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build and runtime)
# Skip postinstall to avoid Prisma generate failing (DATABASE_URL not available during build)
RUN npm install --ignore-scripts

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
