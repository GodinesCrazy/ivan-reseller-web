FROM node:20-alpine

# Instalar OpenSSL (requerido por Prisma)
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Copy Prisma schema BEFORE npm install (needed for postinstall hook)
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Install TypeScript y dependencias de build temporalmente
RUN npm install --save-dev typescript @types/node

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Remove devDependencies
RUN npm prune --production

EXPOSE 3000

# Run with node (not ts-node)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
