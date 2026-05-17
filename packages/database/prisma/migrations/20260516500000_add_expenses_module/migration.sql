-- AlterEnum
ALTER TYPE "PermissionKey" ADD VALUE 'MANAGE_EXPENSES';

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "amountBs" DOUBLE PRECISION NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default categories
INSERT INTO "ExpenseCategory" ("id", "name", "description", "isActive", "isDefault", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Servicios públicos (luz, agua, gas)', 'Pagos de servicios básicos', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Internet y telefonía', 'Servicios de comunicación', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Alquiler', 'Arrendamiento de locales o espacios', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Sueldos y salarios', 'Nómina y compensaciones', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Transporte y fletes', 'Gastos de logística y envíos', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Insumos de oficina', 'Material y suministros de oficina', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Mantenimiento y reparaciones', 'Reparaciones y mantenimiento de equipos', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Publicidad y marketing', 'Gastos de promoción y publicidad', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Gastos bancarios', 'Comisiones e intereses bancarios', true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Otros gastos', 'Gastos no clasificados', true, true, NOW(), NOW());
