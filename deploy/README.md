# Trinity ERP — Deploy a Produccion

## Servidor

- **IP:** 134.209.220.233
- **Dominio:** eltrebol.app
- **API:** api.eltrebol.app
- **Proyecto:** /opt/Trinity

## Requisitos previos

1. DNS configurado: `eltrebol.app` y `api.eltrebol.app` apuntando a `134.209.220.233`
2. Acceso SSH como root al servidor
3. El proyecto ya debe estar clonado en `/opt/Trinity`
4. PM2 corriendo los procesos `trinity-api` (puerto 4000) y `trinity-web` (puerto 3000)

## Paso a paso

### 1. Subir archivos al servidor

```bash
scp -r deploy/ root@134.209.220.233:/opt/Trinity/deploy/
```

### 2. Configurar SSL y Nginx

```bash
ssh root@134.209.220.233
cd /opt/Trinity
sudo bash deploy/setup-ssl.sh
```

Este script:
- Instala Nginx y Certbot (si no estan instalados)
- Copia la configuracion de Nginx para ambos dominios
- Obtiene certificados SSL con Let's Encrypt
- Configura renovacion automatica de certificados

### 3. Actualizar variables de entorno

```bash
bash deploy/update-env.sh /opt/Trinity
```

Este script actualiza:
- `NEXT_PUBLIC_API_URL=https://api.eltrebol.app` (frontend)
- `CORS_ORIGIN=https://eltrebol.app` (backend)

### 4. Rebuild y restart

```bash
bash deploy.sh
```

Esto ejecuta: git pull, pnpm install, prisma migrate, build, restart PM2.

### 5. Verificar

```bash
# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx

# Verificar certificados SSL
sudo certbot certificates

# Verificar la aplicacion
curl -I https://eltrebol.app
curl -I https://api.eltrebol.app/health

# Verificar PM2
pm2 status
```

## Estructura de archivos

```
deploy/
  nginx.conf      — Configuracion Nginx (reverse proxy + SSL)
  setup-ssl.sh    — Script de instalacion Nginx + Certbot + SSL
  update-env.sh   — Script para actualizar variables de entorno
  README.md       — Este archivo
```

## Renovacion de certificados

Los certificados SSL se renuevan automaticamente via:
- **systemd timer** de certbot (si esta disponible), o
- **cron job** diario a las 3:00 AM

Para renovar manualmente:

```bash
sudo certbot renew --dry-run
```

## Troubleshooting

### Nginx no arranca
```bash
sudo nginx -t          # Ver errores de configuracion
sudo journalctl -u nginx --no-pager -n 50
```

### Certificado no se genera
- Verificar que el DNS apunta correctamente: `dig eltrebol.app`
- Verificar que el puerto 80 esta abierto en el firewall
- Ver logs: `sudo journalctl -u certbot --no-pager -n 50`

### API no responde
```bash
pm2 logs trinity-api --lines 50
curl http://localhost:4000/health
```

### Frontend no carga
```bash
pm2 logs trinity-web --lines 50
curl http://localhost:3000
```
