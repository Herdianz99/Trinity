-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesBookEntry" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "controlNumber" TEXT,
    "customerName" TEXT NOT NULL,
    "customerRif" TEXT,
    "exemptAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfAmountBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "isRetentionLine" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesBookEntry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesBookEntry_invoiceId_fkey') THEN
    ALTER TABLE "SalesBookEntry" ADD CONSTRAINT "SalesBookEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesBookEntry_createdById_fkey') THEN
    ALTER TABLE "SalesBookEntry" ADD CONSTRAINT "SalesBookEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
