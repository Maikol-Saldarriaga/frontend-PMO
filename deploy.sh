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
# -rlz en vez de -a: copia contenido + symlinks pero no intenta preservar
# owner/group/permisos/mtime de cada archivo. Con -a, si los archivos remotos
# quedaron con dueño root (deploys previos con sudo, etc), el usuario actual
# no puede tocar esos atributos y rsync termina en exit 23 (partial transfer)
# aunque el contenido sí se haya copiado bien.
rsync -rlz --delete "$DIST_DIR/" "$VPS_HOST:$VPS_PATH/"

echo "==> Deploy completado."
