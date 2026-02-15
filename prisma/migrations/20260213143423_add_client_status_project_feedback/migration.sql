-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('OPEN', 'FOLLOW_UP', 'CLOSED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "projectShared" TEXT,
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");
