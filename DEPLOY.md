# Trinity ERP — Guia de Deploy a Produccion

## Servidor
- **IP:** 134.209.220.233 (DigitalOcean)
- **OS:** Ubuntu 24.04
- **Proyecto:** /opt/Trinity
- **Procesos:** PM2 (trinity-api, trinity-web)
- **Reverse proxy:** Nginx (puerto 80 -> Next.js puerto 3000)
- **Base de datos:** PostgreSQL local (puerto 5432)
- **Cache:** Redis local (puerto 6379)

## Paso a paso

### 1. Conectarse al servidor

```bash
ssh root@134.209.220.233
```

### 2. Ir al proyecto y traer los cambios

```bash
cd /opt/Trinity
git pull origin main
```

### 3. Instalar dependencias (si cambiaron)

```bash
pnpm install
```

### 4. Aplicar migraciones de base de datos (si hay nuevas)

```bash
cd /opt/Trinity/packages/database
npx prisma@5.22.0 migrate deploy
```

### 5. Regenerar Prisma Client (si hubo migraciones o cambios al schema)

```bash
cd /opt/Trinity
npx prisma@5.22.0 generate --schema=packages/database/prisma/schema.prisma
```

### 6. Construir el backend

```bash
pnpm --filter api build
```

### 7. Reiniciar el backend

```bash
pm2 restart trinity-api
```

Verificar que arrancó correctamente:

```bash
sleep 3 && pm2 logs trinity-api --lines 5 --nostream
```

Debe mostrar `[NestApplication] Nest application successfully started` sin errores.

### 8. Construir y reiniciar el frontend (si hubo cambios en web)

```bash
pnpm --filter web build
pm2 restart trinity-web
```

### 9. Verificar que todo funciona

```bash
curl -s http://localhost:4000/ -w "API: %{http_code}\n" -o /dev/null
curl -s http://localhost:3000/ -w "WEB: %{http_code}\n" -o /dev/null
```

### 10. Guardar estado de PM2

```bash
pm2 save
```

## Comando rapido (deploy completo)

```bash
ssh root@134.209.220.233
cd /opt/Trinity && git pull origin main && pnpm install
cd packages/database && npx prisma@5.22.0 migrate deploy && cd ../..
npx prisma@5.22.0 generate --schema=packages/database/prisma/schema.prisma
pnpm --filter api build && pm2 restart trinity-api
pnpm --filter web build && pm2 restart trinity-web
pm2 save
```

## Notas importantes

- **Prisma version:** Usar siempre `prisma@5.22.0`. El sistema global puede tener Prisma 7 que es incompatible.
- **PM2 cwd:** El proceso trinity-api debe tener `cwd: /opt/Trinity/apps/api` para que cargue el `.env` correctamente.
- **Nunca usar** `prisma migrate dev` en produccion. Siempre usar `prisma migrate deploy`.
- **Variables de entorno:** Estan en `/opt/Trinity/apps/api/.env` (backend) y `/opt/Trinity/apps/web/.env` (frontend).

## Troubleshooting

### El API no arranca (DATABASE_URL not found)
El proceso PM2 tiene el cwd incorrecto. Recrear:

```bash
pm2 delete trinity-api
pm2 start /opt/Trinity/apps/api/dist/main.js --name trinity-api --cwd /opt/Trinity/apps/api
pm2 save
```

### Error de build con Prisma (campos no existen)
Faltan migraciones. Ejecutar paso 4 y 5.

### Redis ECONNREFUSED
Redis no esta corriendo. Verificar con `systemctl status redis` o instalarlo si no existe.
