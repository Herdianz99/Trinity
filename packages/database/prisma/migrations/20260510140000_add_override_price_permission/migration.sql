-- CreateEnum
CREATE TYPE "PermissionKey" AS ENUM ('OVERRIDE_PRICE');

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "type",
ADD COLUMN     "documentType" TEXT NOT NULL DEFAULT 'V';

-- DropEnum
DROP TYPE "CustomerType";

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" "PermissionKey" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_permissionKey_key" ON "UserPermission"("userId", "permissionKey");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
