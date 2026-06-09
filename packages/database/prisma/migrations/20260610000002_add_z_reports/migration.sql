-- CreateTable
CREATE TABLE IF NOT EXISTS "ZReport" (
    "id" TEXT NOT NULL,
    "zNumber" INTEGER NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "machineSerial" TEXT NOT NULL,
    "cashRegisterId" TEXT,

    -- Ventas
    "salesExemptBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTaxBase1Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTax1Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTaxBase2Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTax2Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTaxBase3Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTax3Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- Notas de Crédito
    "ncExemptBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncTaxBase1Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncTax1Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncTaxBase2Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncTax2Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncTaxBase3Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ncTax3Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- Notas de Débito
    "ndExemptBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ndTaxBase1Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ndTax1Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ndTaxBase2Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ndTax2Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ndTaxBase3Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ndTax3Bs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- IGTF
    "igtfSalesBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfSalesTaxBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfNcBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfNcTaxBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfNdBaseBs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igtfNdTaxBs" DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- Rangos de documentos
    "lastInvoiceNumber" TEXT,
    "firstInvoiceNumber" TEXT,
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "lastCreditNoteNumber" TEXT,
    "firstCreditNoteNumber" TEXT,
    "creditNoteCount" INTEGER NOT NULL DEFAULT 0,
    "lastDebitNoteNumber" TEXT,
    "firstDebitNoteNumber" TEXT,
    "debitNoteCount" INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "printerFamily" TEXT,
    "rawResponse" TEXT,
    "notes" TEXT,

    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ZReport_zNumber_machineSerial_key" ON "ZReport"("zNumber", "machineSerial");

-- AddForeignKey (CashRegister)
DO $$ BEGIN
    ALTER TABLE "ZReport" ADD CONSTRAINT "ZReport_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey (User)
DO $$ BEGIN
    ALTER TABLE "ZReport" ADD CONSTRAINT "ZReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
