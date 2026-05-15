#!/usr/bin/env bash
# Trinity ERP — Setup SSL with Nginx and Certbot
# Server: 134.209.220.233
# Domains: eltrebol.app, api.eltrebol.app
#
# Usage: sudo bash setup-ssl.sh

set -euo pipefail

DOMAIN="eltrebol.app"
API_DOMAIN="api.eltrebol.app"
EMAIL="admin@eltrebol.app"
NGINX_CONF="/etc/nginx/sites-available/trinity"
NGINX_LINK="/etc/nginx/sites-enabled/trinity"
CERTBOT_WEBROOT="/var/www/certbot"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo " Trinity ERP — SSL Setup"
echo " Domains: $DOMAIN, $API_DOMAIN"
echo "=========================================="

# ─── 1. Install Nginx ────────────────────────────────────────────────

if ! command -v nginx &>/dev/null; then
    echo "[1/5] Installing Nginx..."
    apt-get update -qq
    apt-get install -y -qq nginx
else
    echo "[1/5] Nginx already installed: $(nginx -v 2>&1)"
fi

# ─── 2. Install Certbot ──────────────────────────────────────────────

if ! command -v certbot &>/dev/null; then
    echo "[2/5] Installing Certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
else
    echo "[2/5] Certbot already installed: $(certbot --version 2>&1)"
fi

# ─── 3. Deploy Nginx configuration ───────────────────────────────────

echo "[3/5] Deploying Nginx configuration..."

# Create certbot webroot
mkdir -p "$CERTBOT_WEBROOT"

# Copy config
cp "$SCRIPT_DIR/nginx.conf" "$NGINX_CONF"

# Enable site
ln -sf "$NGINX_CONF" "$NGINX_LINK"

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Test config (will fail on SSL certs if first time — that's ok, we handle below)
# First run: use a temporary HTTP-only config for certbot
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "    SSL certs not found yet. Creating temporary HTTP-only config for certbot..."

    cat > "$NGINX_CONF" <<'HTTPCONF'
server {
    listen 80;
    server_name eltrebol.app www.eltrebol.app api.eltrebol.app;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Trinity ERP — waiting for SSL setup';
        add_header Content-Type text/plain;
    }
}
HTTPCONF

    nginx -t
    systemctl restart nginx
fi

# ─── 4. Obtain SSL certificates ──────────────────────────────────────

echo "[4/5] Obtaining SSL certificates..."

# Certificate for eltrebol.app (includes www)
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    certbot certonly \
        --nginx \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --no-eff-email
    echo "    Certificate obtained for $DOMAIN"
else
    echo "    Certificate for $DOMAIN already exists"
fi

# Certificate for api.eltrebol.app
if [ ! -f "/etc/letsencrypt/live/$API_DOMAIN/fullchain.pem" ]; then
    certbot certonly \
        --nginx \
        -d "$API_DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --no-eff-email
    echo "    Certificate obtained for $API_DOMAIN"
else
    echo "    Certificate for $API_DOMAIN already exists"
fi

# ─── 5. Apply full Nginx config and reload ────────────────────────────

echo "[5/5] Applying full Nginx configuration with SSL..."

# Now copy the real config with SSL blocks
cp "$SCRIPT_DIR/nginx.conf" "$NGINX_CONF"

# Test and reload
nginx -t
systemctl reload nginx

# ─── 6. Setup auto-renewal cron ───────────────────────────────────────

echo "Setting up auto-renewal..."

# Certbot installs a systemd timer by default on modern Ubuntu
# Verify it's active, or create a cron fallback
if systemctl is-active --quiet certbot.timer 2>/dev/null; then
    echo "    Certbot timer already active"
else
    echo "    Adding cron job for certificate renewal..."
    # Add cron if not already present
    CRON_CMD="0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'"
    (crontab -l 2>/dev/null | grep -v "certbot renew" ; echo "$CRON_CMD") | crontab -
    echo "    Cron job added: daily at 3 AM"
fi

echo ""
echo "=========================================="
echo " SSL Setup Complete!"
echo "=========================================="
echo " https://$DOMAIN       → Next.js (port 3000)"
echo " https://$API_DOMAIN   → NestJS  (port 4000)"
echo ""
echo " Certificates will auto-renew via certbot."
echo "=========================================="
