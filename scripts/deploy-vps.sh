#!/usr/bin/env bash
# Deploy del frontend Angular (build "application", sin SSR) al VPS de FODC
# (fodcpmo.cloud).
#
# Mismo patrón que web_ascend/scripts/deploy-vps.sh: antes de sincronizar,
# respalda el contenido actual del VPS a REMOTE_WEB_DIR.bak-<timestamp> (en
# el propio servidor) y además baja copia local a backups/<timestamp>/
# web_backup.tar.gz — por si se pierde acceso al VPS o el backup remoto se
# borra. Rollback con scripts/rollback-vps.sh <timestamp>.
#
# El --delete de rsync solo borra DENTRO de REMOTE_WEB_DIR (carpeta dedicada
# a este build, no compartida con otra app en el VPS) — así los chunks con
# hash viejo de builds anteriores no quedan huérfanos.
#
# Uso:
#   scripts/deploy-vps.sh                # build + deploy con confirmación
#   scripts/deploy-vps.sh --yes          # sin confirmación interactiva
#   scripts/deploy-vps.sh --dry-run      # build real, pero rsync en modo simulación (no escribe nada remoto)
#   scripts/deploy-vps.sh --skip-build   # usa el dist/ que ya esté en disco (no corre `npm run build`)
#
# Requiere scripts/deploy.env (gitignored, ver deploy.env.example) con
# REMOTE_USER/REMOTE_HOST/SSH_KEY/REMOTE_WEB_DIR.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT_DIR/scripts/deploy.env" ] || {
  echo "❌ Falta $ROOT_DIR/scripts/deploy.env — copia deploy.env.example y ajusta." >&2
  exit 1
}
source "$ROOT_DIR/scripts/deploy.env"

REMOTE_USER="${REMOTE_USER:?set REMOTE_USER en scripts/deploy.env}"
REMOTE_HOST="${REMOTE_HOST:?set REMOTE_HOST en scripts/deploy.env}"
REMOTE_PORT="${REMOTE_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_WEB_DIR="${REMOTE_WEB_DIR:?set REMOTE_WEB_DIR en scripts/deploy.env}"

# Salvaguarda: REMOTE_WEB_DIR se usa con `rsync --delete` y `rm -rf` para el
# respaldo viejo — un valor vacío, "/" o demasiado corto sería catastrófico.
case "$REMOTE_WEB_DIR" in
  /*fodc*) : ;;
  *)
    echo "❌ REMOTE_WEB_DIR ('$REMOTE_WEB_DIR') no parece una ruta segura (se espera algo como /var/www/fodc). Abortando." >&2
    exit 1
    ;;
esac

AUTO_YES=0
DRY_RUN=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y)   AUTO_YES=1 ;;
    --dry-run)  DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "❌ Argumento desconocido: $arg" >&2; exit 1 ;;
  esac
done

SSH_OPTS=(-p "$REMOTE_PORT")
[ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
RSYNC_SSH="ssh -p $REMOTE_PORT"
[ -n "$SSH_KEY" ] && RSYNC_SSH="ssh -p $REMOTE_PORT -i $SSH_KEY"

BUILD_DIR="$ROOT_DIR/dist/project-pmo/browser"

echo "==> Verificando conexión SSH a $REMOTE_USER@$REMOTE_HOST"
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_USER@$REMOTE_HOST" true

if [ "$SKIP_BUILD" -eq 1 ]; then
  echo "==> --skip-build: usando el dist/ que ya está en disco"
  [ -f "$BUILD_DIR/index.html" ] || { echo "❌ No hay build en $BUILD_DIR (falta index.html). Corre sin --skip-build." >&2; exit 1; }
else
  echo "==> Instalando dependencias (si hace falta)"
  cd "$ROOT_DIR"
  [ -d node_modules ] || npm install

  echo "==> Compilando build de producción (ng build --configuration production)"
  npm run build -- --configuration production

  [ -f "$BUILD_DIR/index.html" ] || { echo "❌ El build no generó $BUILD_DIR/index.html — algo falló." >&2; exit 1; }
fi

BUILD_SIZE="$(du -sh "$BUILD_DIR" | cut -f1)"
FILE_COUNT="$(find "$BUILD_DIR" -type f | wc -l | tr -d ' ')"
echo "==> Build listo: $BUILD_DIR ($BUILD_SIZE, $FILE_COUNT archivos)"

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${REMOTE_WEB_DIR}.bak-${TS}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "==> DRY RUN: no se va a tocar el servidor. Vista previa de cambios:"
  rsync -rlvzn --delete -e "$RSYNC_SSH" "$BUILD_DIR/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_WEB_DIR/"
  echo
  echo "(dry-run) fin — nada se modificó en el servidor."
  exit 0
fi

echo
echo "==> Se va a desplegar a $REMOTE_USER@$REMOTE_HOST:$REMOTE_WEB_DIR"
echo "    Respaldo previo en: $BACKUP_DIR"
echo "    (nginx y el resto de sitios del server quedan intactos)"
if [ "$AUTO_YES" -ne 1 ]; then
  read -r -p "Continuar? [y/N] " CONFIRM
  CONFIRM="${CONFIRM%$'\r'}"
  [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ] || { echo "Cancelado."; exit 1; }
fi

echo "==> Respaldando contenido actual en el servidor ($BACKUP_DIR)"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "test -d '$REMOTE_WEB_DIR' && cp -a '$REMOTE_WEB_DIR' '$BACKUP_DIR' || mkdir -p '$REMOTE_WEB_DIR'"

echo "==> Bajando copia local de ese backup (por si se pierde acceso al VPS o se borra el remoto)"
LOCAL_BACKUP_DIR="$ROOT_DIR/backups/$TS"
mkdir -p "$LOCAL_BACKUP_DIR"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "tar czf - -C '$(dirname "$BACKUP_DIR")' '$(basename "$BACKUP_DIR")'" \
  > "$LOCAL_BACKUP_DIR/web_backup.tar.gz"
du -sh "$LOCAL_BACKUP_DIR/web_backup.tar.gz" 2>/dev/null | sed 's/^/    /'

echo "==> Purgando backups remotos viejos (se conservan los últimos 10)"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "cd '$(dirname "$REMOTE_WEB_DIR")' && ls -1dt '$(basename "$REMOTE_WEB_DIR")'.bak-* 2>/dev/null | tail -n +11 | xargs -r rm -rf --" || true

echo "==> Sincronizando build (rsync --delete, solo dentro de $REMOTE_WEB_DIR)"
# -rlvz en vez de -avz (sin -p/-t/-o/-g): si los directorios remotos quedaron
# con dueño distinto al usuario de deploy (deploys previos con sudo, etc), no
# se puede tocar owner/permisos/mtime del directorio en sí (rsync devuelve
# exit 23 aunque los archivos sí se copien bien). Los permisos de archivo
# quedan explícitos en el chmod de abajo, así que no hace falta preservarlos.
rsync -rlvz --delete -e "$RSYNC_SSH" "$BUILD_DIR/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_WEB_DIR/"

echo "==> Asegurando permisos de lectura para nginx"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "find '$REMOTE_WEB_DIR' -type d -exec chmod 755 {} \; 2>/dev/null; find '$REMOTE_WEB_DIR' -type f -exec chmod 644 {} \;" || true

echo
echo "==> Verificando que el sitio responde"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://fodcpmo.cloud/" || echo "curl_failed")"
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ https://fodcpmo.cloud/ respondió 200"
else
  echo "⚠️  https://fodcpmo.cloud/ respondió '$HTTP_CODE' (revisa manualmente antes de dar por bueno el deploy)"
fi

echo
echo "✅ Deploy OK."
echo "   Rollback si algo sale mal: scripts/rollback-vps.sh $TS"
