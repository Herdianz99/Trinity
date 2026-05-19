#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════
# Trinity ERP — Script de Deploy Automatizado
# Uso: ssh root@134.209.220.233 "cd /opt/Trinity && bash deploy.sh"
# O desde el servidor: cd /opt/Trinity && bash deploy.sh
# ═══════════════════════════════════════════════════════════

PROJECT_DIR="/opt/Trinity"
PRISMA_BIN="$PROJECT_DIR/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/node_modules/.bin/prisma"

# Cargar DATABASE_URL desde .env de forma robusta
if [ -f /opt/Trinity/.env ]; then
  export DATABASE_URL=$(grep -oP '(?<=DATABASE_URL=")[^"]+' /opt/Trinity/.env || grep -oP '(?<=DATABASE_URL=)[^\s]+' /opt/Trinity/.env)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "  ✗ No se pudo cargar DATABASE_URL desde .env"
  exit 1
fi

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step=0
total=9
errors=0

log()   { step=$((step+1)); echo -e "\n${CYAN}[$step/$total]${NC} $1"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; errors=$((errors+1)); }

echo -e "${CYAN}══════════════════════════════════════${NC}"
echo -e "${CYAN}  Trinity ERP — Deploy${NC}"
echo -e "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"

cd "$PROJECT_DIR"

# ── 1. Git pull ──
log "Descargando cambios de GitHub..."
BEFORE=$(git rev-parse HEAD)
git pull origin main --ff-only
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  warn "Sin cambios nuevos (ya estaba actualizado)"
else
  COMMITS=$(git log --oneline "$BEFORE".."$AFTER" | wc -l)
  ok "$COMMITS commit(s) nuevos descargados"
  git log --oneline "$BEFORE".."$AFTER" | head -5 | while read line; do
    echo -e "    ${GREEN}→${NC} $line"
  done
fi

# ── 2. Instalar dependencias ──
log "Instalando dependencias..."
if git diff "$BEFORE".."$AFTER" --name-only 2>/dev/null | grep -qE 'package\.json|pnpm-lock'; then
  pnpm install --no-frozen-lockfile 2>&1 | tail -5
  ok "Dependencias actualizadas"
else
  ok "Sin cambios en dependencias (saltado)"
fi

# ── 3. Migraciones de base de datos ──
log "Aplicando migraciones de base de datos..."
cd "$PROJECT_DIR"
SCHEMA="packages/database/prisma/schema.prisma"
# DATABASE_URL ya fue cargado via source al inicio del script
echo "  Usando prisma: $PRISMA_BIN"
echo "  Schema: $SCHEMA"
echo "  DATABASE_URL: ${DATABASE_URL:0:30}..."
if timeout 120 "$PRISMA_BIN" migrate deploy --schema="$SCHEMA" 2>&1; then
  ok "Migraciones aplicadas correctamente"
else
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 124 ]; then
    fail "Migraciones: timeout después de 120 segundos"
  else
    fail "Error en migraciones (exit code: $EXIT_CODE)"
  fi
fi

# ── 4. Auditoría de schema (red de seguridad) ──
log "Auditando schema de base de datos..."
cd "$PROJECT_DIR"

if [ -n "$DATABASE_URL" ]; then
  # Ejecutar check-schema.sql pasando URL explícitamente
  AUDIT_OUTPUT=$(psql "$DATABASE_URL" -f deploy/check-schema.sql 2>&1 || true)

  if echo "$AUDIT_OUTPUT" | grep -q "MISSING"; then
    warn "Se detectaron elementos faltantes en el schema"
    echo "$AUDIT_OUTPUT" | grep "MISSING" | head -20 | while read line; do
      echo -e "    ${YELLOW}→${NC} $line"
    done
    echo -e "  ${CYAN}Ejecutando fix-schema.sql...${NC}"
    if psql "$DATABASE_URL" -f deploy/fix-schema.sql 2>&1 | tail -5; then
      ok "Schema corregido automáticamente"
    else
      fail "Error ejecutando fix-schema.sql"
    fi
  else
    ok "Schema sincronizado correctamente"
  fi
else
  fail "DATABASE_URL no disponible — verificar archivos .env"
fi

# ── 5. Regenerar Prisma Client ──
log "Regenerando Prisma Client..."
cd "$PROJECT_DIR"
if timeout 60 "$PRISMA_BIN" generate --schema="$SCHEMA" 2>&1 | tail -2; then
  ok "Prisma Client regenerado"
else
  fail "Error generando Prisma Client"
fi

# ── 6. Build y restart API ──
log "Construyendo y reiniciando API..."
cd "$PROJECT_DIR"
pnpm --filter api build 2>&1 | tail -3
pm2 restart trinity-api --update-env 2>&1 | tail -1
sleep 3

# Verificar que el API arranco
API_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const p=d.find(x=>x.name==='trinity-api');
  console.log(p?p.pm2_env.status:'not_found');
" 2>/dev/null || echo "unknown")

if [ "$API_STATUS" = "online" ]; then
  ok "API reiniciada correctamente (online)"
else
  fail "API no esta online (status: $API_STATUS)"
  pm2 logs trinity-api --lines 10 --nostream 2>/dev/null || true
fi

# ── 7. Build y restart Web ──
log "Construyendo y reiniciando Web..."
cd "$PROJECT_DIR"
pnpm --filter web build 2>&1 | tail -5
pm2 restart trinity-web --update-env 2>&1 | tail -1
sleep 2

WEB_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const p=d.find(x=>x.name==='trinity-web');
  console.log(p?p.pm2_env.status:'not_found');
" 2>/dev/null || echo "unknown")

if [ "$WEB_STATUS" = "online" ]; then
  ok "Web reiniciada correctamente (online)"
else
  fail "Web no esta online (status: $WEB_STATUS)"
  pm2 logs trinity-web --lines 10 --nostream 2>/dev/null || true
fi

# ── 8. Health check con reintentos ──
log "Verificando servicios (health check)..."
sleep 2

# Health check API con reintentos
API_HEALTHY=false
for i in $(seq 1 15); do
  HEALTH_RESPONSE=$(curl -s http://localhost:4000/health 2>/dev/null || echo "")
  if echo "$HEALTH_RESPONSE" | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.exit(d.status==='ok' && d.database==='ok' ? 0 : 1);
  " 2>/dev/null; then
    API_HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$API_HEALTHY" = true ]; then
  ok "API health check OK (database conectada)"
else
  fail "API health check falló después de 30s"
  echo -e "  ${YELLOW}Última respuesta: $HEALTH_RESPONSE${NC}"
  pm2 logs trinity-api --lines 15 --nostream 2>/dev/null || true
fi

# Verificar Web
WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$WEB_CODE" != "000" ]; then
  ok "Web respondiendo (HTTP $WEB_CODE)"
else
  fail "Web no responde"
fi

# ── 9. Guardar estado PM2 ──
log "Guardando estado de PM2..."
pm2 save 2>&1 | tail -1
ok "Estado guardado"

# ── Resumen ──
echo -e "\n${CYAN}══════════════════════════════════════${NC}"
if [ $errors -eq 0 ]; then
  echo -e "${GREEN}  Deploy completado sin errores${NC}"
else
  echo -e "${RED}  Deploy completado con $errors error(es)${NC}"
  echo -e "${YELLOW}  Revisa los logs: pm2 logs --lines 20${NC}"
fi
echo -e "${CYAN}  Commit: $(git rev-parse --short HEAD)${NC}"
echo -e "${CYAN}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}══════════════════════════════════════${NC}"

exit $errors
