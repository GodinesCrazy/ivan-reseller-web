FROM node:20-alpine

# Instalar OpenSSL (requerido por Prisma)
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy Prisma schema BEFORE npm install (needed for postinstall hook)
COPY prisma ./prisma/

# Install ALL dependencies first (for build)
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript (ignora errores con || true)
RUN npm run build

# Now remove devDependencies except those needed for runtime
RUN npm prune --production

# Re-install runtime dependencies that were in devDependencies
RUN npm install --save bcryptjs

EXPOSE 3000

# Run with node (not ts-node)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
