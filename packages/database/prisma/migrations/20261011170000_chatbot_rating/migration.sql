-- Piloto del chatbot: quien atiende el WhatsApp califica cada respuesta del bot (1 = la uso tal cual,
-- -1 = tuvo que corregirla). Aditivo e idempotente.
ALTER TABLE "ChatbotMessage" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "ChatbotMessage" ADD COLUMN IF NOT EXISTS "ratedAt" TIMESTAMP(3);

-- Permiso aparte para la configuracion del bot (precios, textos, tope): solo ADMIN por defecto.
UPDATE "RolePermission" SET modules = array_append(modules, 'chatbot-config')
WHERE role = 'ADMIN' AND NOT ('chatbot-config' = ANY(modules)) AND NOT ('*' = ANY(modules));
