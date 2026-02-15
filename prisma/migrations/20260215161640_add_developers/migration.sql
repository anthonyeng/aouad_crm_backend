/*
  Warnings:

  - You are about to drop the column `featuredOrder` on the `Developer` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `Developer` table. All the data in the column will be lost.
  - Made the column `description` on table `Developer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `logoUrl` on table `Developer` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Developer" DROP COLUMN "featuredOrder",
DROP COLUMN "website",
ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "logoUrl" SET NOT NULL,
ALTER COLUMN "isFeatured" SET DEFAULT true;
