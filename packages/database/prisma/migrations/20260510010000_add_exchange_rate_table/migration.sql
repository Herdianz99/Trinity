-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('BCV', 'MANUAL');

-- AlterTable
ALTER TABLE "CompanyConfig" DROP COLUMN IF EXISTS "exchangeRate",
DROP COLUMN IF EXISTS "exchangeRateUpdatedAt";

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_key" ON "ExchangeRate"("date");
