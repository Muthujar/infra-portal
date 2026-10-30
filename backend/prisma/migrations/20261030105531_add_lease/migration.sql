-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "leaseDays" INTEGER;
