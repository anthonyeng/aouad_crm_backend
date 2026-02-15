-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('OFF_PLAN', 'FOR_SALE', 'FOR_RENT');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'AED', 'EUR');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "community" TEXT,
ADD COLUMN     "completionYear" INTEGER,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'USD',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "developerName" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listingType" "ListingType" NOT NULL DEFAULT 'OFF_PLAN',
ADD COLUMN     "locationLabel" TEXT,
ADD COLUMN     "startingPrice" INTEGER;

-- CreateIndex
CREATE INDEX "Client_clientType_idx" ON "Client"("clientType");

-- CreateIndex
CREATE INDEX "Client_urgency_idx" ON "Client"("urgency");

-- CreateIndex
CREATE INDEX "Listing_listingType_idx" ON "Listing"("listingType");

-- CreateIndex
CREATE INDEX "Listing_featured_idx" ON "Listing"("featured");

-- CreateIndex
CREATE INDEX "Listing_isHidden_idx" ON "Listing"("isHidden");

-- CreateIndex
CREATE INDEX "Listing_deletedAt_idx" ON "Listing"("deletedAt");

-- CreateIndex
CREATE INDEX "ListingImage_isCover_idx" ON "ListingImage"("isCover");

-- CreateIndex
CREATE INDEX "ListingImage_order_idx" ON "ListingImage"("order");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");
