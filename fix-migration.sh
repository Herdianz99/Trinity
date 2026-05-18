#!/bin/bash
cd /opt/Trinity
export $(grep -E '^DATABASE_URL=' packages/database/.env | xargs)
PRISMA="node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/node_modules/.bin/prisma"
SCHEMA="packages/database/prisma/schema.prisma"
$PRISMA migrate resolve --rolled-back 20260516250000_add_missing_tables --schema=$SCHEMA
echo "--- Done resolve, now running deploy ---"
bash deploy.sh
