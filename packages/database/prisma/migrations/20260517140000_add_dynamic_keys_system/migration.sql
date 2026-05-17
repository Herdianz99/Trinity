-- CreateEnum: DynamicKeyPerm
CREATE TYPE "DynamicKeyPerm" AS ENUM (
  'DELETE_CREDIT_NOTE_SALE',
  'DELETE_DEBIT_NOTE_SALE',
  'DELETE_CREDIT_NOTE_PURCHASE',
  'DELETE_DEBIT_NOTE_PURCHASE',
  'DELETE_RECEIPT_COLLECTION',
  'DELETE_RECEIPT_PAYMENT',
  'DELETE_EXPENSE',
  'MODIFY_PRODUCT_PRICE',
  'CANCEL_CASH_SESSION',
  'CHANGE_EXCHANGE_RATE',
  'MANUAL_STOCK_ADJUSTMENT',
  'GIVE_DISCOUNT',
  'ALLOW_CREDIT_INVOICE'
);

-- CreateTable: DynamicKey
CREATE TABLE "DynamicKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DynamicKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DynamicKeyPermission
CREATE TABLE "DynamicKeyPermission" (
    "id" TEXT NOT NULL,
    "dynamicKeyId" TEXT NOT NULL,
    "permission" "DynamicKeyPerm" NOT NULL,
    CONSTRAINT "DynamicKeyPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DynamicKeyLog
CREATE TABLE "DynamicKeyLog" (
    "id" TEXT NOT NULL,
    "dynamicKeyId" TEXT NOT NULL,
    "permission" "DynamicKeyPerm" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DynamicKeyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DynamicKeyPermission_dynamicKeyId_permission_key" ON "DynamicKeyPermission"("dynamicKeyId", "permission");

-- AddForeignKey
ALTER TABLE "DynamicKey" ADD CONSTRAINT "DynamicKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicKeyPermission" ADD CONSTRAINT "DynamicKeyPermission_dynamicKeyId_fkey" FOREIGN KEY ("dynamicKeyId") REFERENCES "DynamicKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DynamicKeyLog" ADD CONSTRAINT "DynamicKeyLog_dynamicKeyId_fkey" FOREIGN KEY ("dynamicKeyId") REFERENCES "DynamicKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
