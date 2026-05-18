#!/bin/bash
cd /opt/Trinity
export $(grep -E '^DATABASE_URL=' packages/database/.env | xargs)
PRISMA="node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/node_modules/.bin/prisma"
SCHEMA="packages/database/prisma/schema.prisma"
echo "Marcando migraciones como aplicadas..."
$PRISMA migrate resolve --applied 20260516250000_add_missing_tables --schema=$SCHEMA
$PRISMA migrate resolve --applied 20260517200000_add_default_customer_config --schema=$SCHEMA
$PRISMA migrate resolve --applied 20260517210000_add_paid_amount_to_credit_debit_note --schema=$SCHEMA
$PRISMA migrate resolve --applied 20260517233000_add_igtf_to_credit_debit_note --schema=$SCHEMA
$PRISMA migrate resolve --applied 20260517234000_add_fiscal_printed_and_machine_serial --schema=$SCHEMA
$PRISMA migrate resolve --applied 20260518000000_add_machine_serial_to_credit_note --schema=$SCHEMA
echo "--- Done resolve, now running deploy ---"
bash deploy.sh
