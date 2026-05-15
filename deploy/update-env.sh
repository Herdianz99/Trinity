#!/usr/bin/env bash
# Trinity ERP — Update environment variables for production
# Server: 134.209.220.233
# Domain: eltrebol.app | API: api.eltrebol.app
#
# Usage: bash update-env.sh [PROJECT_DIR]

set -euo pipefail

PROJECT_DIR="${1:-/opt/Trinity}"

echo "=========================================="
echo " Trinity ERP — Update Production Env"
echo " Project: $PROJECT_DIR"
echo "=========================================="

if [ ! -d "$PROJECT_DIR" ]; then
    echo "ERROR: Project directory $PROJECT_DIR not found"
    exit 1
fi

# ─── Helper: update or add a key in an env file ──────────────────────

update_env() {
    local file="$1"
    local key="$2"
    local value="$3"

    if [ ! -f "$file" ]; then
        echo "$key=$value" > "$file"
        echo "    Created $file with $key"
        return
    fi

    if grep -q "^${key}=" "$file" 2>/dev/null; then
        # Replace existing value
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        echo "    Updated $key in $file"
    else
        # Append
        echo "$key=$value" >> "$file"
        echo "    Added $key to $file"
    fi
}

# ─── 1. Root .env ─────────────────────────────────────────────────────

echo ""
echo "[1/3] Updating root .env..."
ROOT_ENV="$PROJECT_DIR/.env"

update_env "$ROOT_ENV" "NEXT_PUBLIC_API_URL" "https://api.eltrebol.app"

# ─── 2. Frontend (apps/web/.env) ──────────────────────────────────────

echo ""
echo "[2/3] Updating apps/web/.env..."
WEB_ENV="$PROJECT_DIR/apps/web/.env"

update_env "$WEB_ENV" "NEXT_PUBLIC_API_URL" "https://api.eltrebol.app"

# ─── 3. Backend (apps/api/.env) ───────────────────────────────────────

echo ""
echo "[3/3] Updating apps/api/.env..."
API_ENV="$PROJECT_DIR/apps/api/.env"

update_env "$API_ENV" "CORS_ORIGIN" "https://eltrebol.app"

echo ""
echo "=========================================="
echo " Environment variables updated!"
echo "=========================================="
echo ""
echo " Frontend (web):"
echo "   NEXT_PUBLIC_API_URL=https://api.eltrebol.app"
echo ""
echo " Backend (api):"
echo "   CORS_ORIGIN=https://eltrebol.app"
echo ""
echo " IMPORTANT: Rebuild and restart after updating:"
echo "   cd $PROJECT_DIR && bash deploy.sh"
echo "=========================================="
