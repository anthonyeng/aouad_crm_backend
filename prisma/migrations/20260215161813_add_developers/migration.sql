-- AlterTable
ALTER TABLE "Developer" ADD COLUMN     "featuredOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "Developer_isFeatured_idx" ON "Developer"("isFeatured");

-- CreateIndex
CREATE INDEX "Developer_featuredOrder_idx" ON "Developer"("featuredOrder");
