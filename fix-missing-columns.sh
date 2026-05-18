#!/bin/bash
# Fix: Apply SQL from migrations that were marked as "applied" but never executed
cd /opt/Trinity

export $(grep -E '^DATABASE_URL=' packages/database/.env | xargs)
PRISMA="node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/node_modules/.bin/prisma"
SCHEMA="packages/database/prisma/schema.prisma"

echo "=== Applying missing columns to database ==="

$PRISMA db execute --schema=$SCHEMA --file=fix-missing-columns.sql

if [ $? -eq 0 ]; then
  echo "=== SUCCESS: Columns added ==="
  echo "Restarting API..."
  pm2 restart trinity-api
  sleep 3
  echo "API restarted. Testing..."
  curl -s -o /dev/null -w "API HTTP status: %{http_code}\n" http://localhost:4000/
  echo "=== Done ==="
else
  echo "=== ERROR: Failed to apply SQL ==="
  exit 1
fi
