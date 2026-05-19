-- PICO: Plan Inteligente de Crecimiento Organico (blog, SEO evolutivo, video multi-canal)

ALTER TABLE "cj_shopify_usa_listings"
  ADD COLUMN IF NOT EXISTS "lastSeoUpdate" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "cj_shopify_usa_blog_entries" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "shopifyArticleId" TEXT,
  "keyword" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentHtml" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "publishedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_shopify_usa_blog_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cj_shopify_usa_blog_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "cj_shopify_usa_products"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cj_shopify_usa_blog_entries_userId_productId_key"
  ON "cj_shopify_usa_blog_entries" ("userId", "productId");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_blog_entries_userId_status_idx"
  ON "cj_shopify_usa_blog_entries" ("userId", "status");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_blog_entries_productId_idx"
  ON "cj_shopify_usa_blog_entries" ("productId");

CREATE TABLE IF NOT EXISTS "cj_shopify_usa_video_posts" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "listingId" INTEGER NOT NULL,
  "renderGroupId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "caption" TEXT,
  "hashtags" TEXT,
  "imageUrls" JSONB,
  "renderId" TEXT,
  "videoUrl" TEXT,
  "externalId" TEXT,
  "publishUrl" TEXT,
  "errorMsg" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cj_shopify_usa_video_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cj_shopify_usa_video_posts_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "cj_shopify_usa_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cj_shopify_usa_video_posts_userId_listingId_platform_key"
  ON "cj_shopify_usa_video_posts" ("userId", "listingId", "platform");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_video_posts_userId_status_idx"
  ON "cj_shopify_usa_video_posts" ("userId", "status");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_video_posts_listingId_idx"
  ON "cj_shopify_usa_video_posts" ("listingId");
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_video_posts_renderGroupId_idx"
  ON "cj_shopify_usa_video_posts" ("renderGroupId");
