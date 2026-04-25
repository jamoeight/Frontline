#!/usr/bin/env bash
# Frontline deploy: pull latest, rebuild frontend, sync to web root, restart api.
set -euo pipefail

REPO_DIR=/home/ubuntu/Frontline
WEB_ROOT=/var/www/frontline

cd "$REPO_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> install backend deps"
pip install --user -q -r requirements.txt

echo "==> build frontend"
cd "$REPO_DIR/frontend"
npm ci
npm run build

echo "==> sync dist to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete "$REPO_DIR/frontend/dist/" "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT"

echo "==> restart frontline-api"
sudo systemctl restart frontline-api
sudo systemctl --no-pager status frontline-api | head -10

echo "==> reload nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> health check"
curl -fsS http://127.0.0.1:8000/health
echo
echo "deploy ok"
