-- AlterEnum
ALTER TYPE "ReceiptItemType" ADD VALUE 'CREDIT_NOTE';
ALTER TYPE "ReceiptItemType" ADD VALUE 'DEBIT_NOTE';

-- AlterTable
ALTER TABLE "CreditDebitNote" ADD COLUMN "appliedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReceiptItem" ADD COLUMN "creditDebitNoteId" TEXT;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_creditDebitNoteId_fkey" FOREIGN KEY ("creditDebitNoteId") REFERENCES "CreditDebitNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
