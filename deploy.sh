#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════
# Trinity ERP — Script de Deploy Automatizado
# Uso: ssh root@134.209.220.233 "cd /opt/Trinity && bash deploy.sh"
# O desde el servidor: cd /opt/Trinity && bash deploy.sh
# ═══════════════════════════════════════════════════════════

PROJECT_DIR="/opt/Trinity"
PRISMA_BIN="$PROJECT_DIR/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/node_modules/.bin/prisma"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step=0
total=8
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
# Cargar DATABASE_URL desde .env (prisma no lo encuentra desde la ruta .pnpm/)
export $(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | xargs)
echo "  Usando prisma: $PRISMA_BIN"
echo "  Schema: $SCHEMA"
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

# ── 4. Regenerar Prisma Client ──
log "Regenerando Prisma Client..."
cd "$PROJECT_DIR"
if timeout 60 "$PRISMA_BIN" generate --schema="$SCHEMA" 2>&1 | tail -2; then
  ok "Prisma Client regenerado"
else
  fail "Error generando Prisma Client"
fi

# ── 5. Build y restart API ──
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

# ── 6. Build y restart Web ──
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

# ── 7. Verificar servicios ──
log "Verificando servicios..."
sleep 2

API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/ 2>/dev/null || echo "000")
if [ "$API_CODE" != "000" ]; then
  ok "API respondiendo (HTTP $API_CODE)"
else
  fail "API no responde"
fi

WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$WEB_CODE" != "000" ]; then
  ok "Web respondiendo (HTTP $WEB_CODE)"
else
  fail "Web no responde"
fi

# ── 8. Guardar estado PM2 ──
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
