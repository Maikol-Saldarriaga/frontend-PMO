#!/usr/bin/env bash
set -euo pipefail

# Despliega el frontend Angular al VPS de FODC.
# Uso: ./deploy.sh

VPS_HOST="juandiego@10.0.0.1"
VPS_PATH="/var/www/fodc"
DIST_DIR="dist/project-pmo"

cd "$(dirname "$0")"

echo "==> Compilando build de producción..."
npm run build -- --configuration production

if [ ! -d "$DIST_DIR/browser" ]; then
  echo "Error: no se encontró $DIST_DIR/browser. ¿Falló el build?"
  exit 1
fi

echo "==> Sincronizando con $VPS_HOST:$VPS_PATH ..."
# --omit-dir-times evita el warning "failed to set times" en directorios
# que pertenecen a root (el usuario solo tiene permiso de grupo, no dueño).
rsync -avz --delete --omit-dir-times "$DIST_DIR/" "$VPS_HOST:$VPS_PATH/"

echo "==> Deploy completado."
