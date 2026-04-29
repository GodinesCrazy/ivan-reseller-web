-- CreateTable: CjShopifyUsaSocialPost
CREATE TABLE IF NOT EXISTS "cj_shopify_usa_social_posts" (
    "id"         SERIAL NOT NULL,
    "userId"     INTEGER NOT NULL,
    "listingId"  INTEGER NOT NULL,
    "platform"   TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "externalId" TEXT,
    "status"     TEXT NOT NULL DEFAULT 'PENDING',
    "url"        TEXT,
    "errorMsg"   TEXT,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cj_shopify_usa_social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cj_shopify_usa_social_posts_userId_platform_idx"
    ON "cj_shopify_usa_social_posts"("userId", "platform");

CREATE INDEX IF NOT EXISTS "cj_shopify_usa_social_posts_listingId_idx"
    ON "cj_shopify_usa_social_posts"("listingId");

CREATE INDEX IF NOT EXISTS "cj_shopify_usa_social_posts_userId_status_idx"
    ON "cj_shopify_usa_social_posts"("userId", "status");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cj_shopify_usa_social_posts_userId_fkey'
          AND table_name = 'cj_shopify_usa_social_posts'
    ) THEN
        ALTER TABLE "cj_shopify_usa_social_posts"
            ADD CONSTRAINT "cj_shopify_usa_social_posts_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'cj_shopify_usa_social_posts_listingId_fkey'
          AND table_name = 'cj_shopify_usa_social_posts'
    ) THEN
        ALTER TABLE "cj_shopify_usa_social_posts"
            ADD CONSTRAINT "cj_shopify_usa_social_posts_listingId_fkey"
            FOREIGN KEY ("listingId") REFERENCES "cj_shopify_usa_listings"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
