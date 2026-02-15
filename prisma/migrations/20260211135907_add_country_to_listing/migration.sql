-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "country" TEXT;

-- CreateIndex
CREATE INDEX "Listing_country_idx" ON "Listing"("country");
