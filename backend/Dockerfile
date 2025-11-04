FROM node:20-alpine

# Instalar OpenSSL (requerido por Prisma)
RUN apk add --no-cache openssl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema BEFORE npm install (needed for postinstall hook)
COPY prisma ./prisma/

# Install ALL dependencies including devDependencies (needed for ts-node)
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

# Use simple start command with ts-node
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node src/server.ts"]
