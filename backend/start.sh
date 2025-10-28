#!/bin/sh
echo "🔧 Installing dependencies..."
npm install

echo "🔨 Building TypeScript..."
npm run build

echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "🌱 Seeding database..."
npx tsx prisma/seed.ts || echo "⚠️  Seed skipped"

echo "🚀 Starting server..."
node dist/server.js
