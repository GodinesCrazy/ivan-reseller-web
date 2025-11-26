-- CreateTable
CREATE TABLE IF NOT EXISTS "meeting_rooms" (
    "id" SERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "adminId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_rooms_roomId_key" ON "meeting_rooms"("roomId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_rooms_userId_status_idx" ON "meeting_rooms"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_rooms_adminId_status_idx" ON "meeting_rooms"("adminId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_rooms_status_idx" ON "meeting_rooms"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meeting_rooms_roomId_idx" ON "meeting_rooms"("roomId");

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_rooms" ADD CONSTRAINT "meeting_rooms_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

