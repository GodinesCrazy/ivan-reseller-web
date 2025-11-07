-- CreateTable
CREATE TABLE "ai_suggestions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impactRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impactTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "actionable" BOOLEAN NOT NULL DEFAULT true,
    "implemented" BOOLEAN NOT NULL DEFAULT false,
    "implementedAt" TIMESTAMP(3),
    "estimatedTime" TEXT NOT NULL,
    "requirements" TEXT,
    "steps" TEXT,
    "relatedProducts" TEXT,
    "metrics" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_suggestions_userId_title_key" ON "ai_suggestions"("userId", "title");

-- AddForeignKey
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

