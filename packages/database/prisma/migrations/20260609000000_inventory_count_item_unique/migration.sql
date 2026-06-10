-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryCountItem_inventoryCountId_productId_key" ON "InventoryCountItem"("inventoryCountId", "productId");
