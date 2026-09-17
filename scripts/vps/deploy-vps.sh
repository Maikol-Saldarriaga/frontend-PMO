#!/usr/bin/env bash
# Deploy del frontend Angular (build "application", sin SSR) al VPS de FODC
# (fodcpmo.cloud).
#
# Mismo patrón que web_ascend/scripts/vps/deploy-vps.sh: antes de sincronizar,
# respalda el contenido actual del VPS a REMOTE_WEB_DIR.bak-<timestamp> (en
# el propio servidor) y además baja copia local a backups/<timestamp>/
# web_backup.tar.gz — por si se pierde acceso al VPS o el backup remoto se
# borra. Rollback con scripts/vps/rollback-vps.sh <timestamp>.
#
# El --delete de rsync solo borra DENTRO de REMOTE_WEB_DIR (carpeta dedicada
# a este build, no compartida con otra app en el VPS) — así los chunks con
# hash viejo de builds anteriores no quedan huérfanos.
#
# Uso:
#   scripts/vps/deploy-vps.sh                # build + deploy con confirmación
#   scripts/vps/deploy-vps.sh --yes          # sin confirmación interactiva
#   scripts/vps/deploy-vps.sh --dry-run      # build real, pero rsync en modo simulación (no escribe nada remoto)
#   scripts/vps/deploy-vps.sh --skip-build   # usa el dist/ que ya esté en disco (no corre `npm run build`)
#   scripts/vps/deploy-vps.sh --no-local-backup  # no baja tar.gz local (solo respaldo remoto, deploy más rápido)
#
# Requiere scripts/vps/deploy.env (gitignored, ver deploy.env.example) con
# REMOTE_USER/REMOTE_HOST/SSH_KEY/REMOTE_WEB_DIR.
#
# IMPORTANTE: el build se sincroniza PLANO dentro de REMOTE_WEB_DIR (sin
# subcarpeta "browser"). La conf nginx del sitio debe tener
# `root REMOTE_WEB_DIR;` (NO `REMOTE_WEB_DIR/browser`). Si alguien reconstruye
# el server o el sitio nginx desde cero con root apuntando a .../browser, el
# deploy queda con index.html en la raíz pero nginx buscando en una carpeta
# inexistente -> error 500 "rewrite or internal redirection cycle" al pedir /.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$ROOT_DIR/scripts/vps/deploy.env" ] || {
  echo "❌ Falta $ROOT_DIR/scripts/vps/deploy.env — copia deploy.env.example y ajusta." >&2
  exit 1
}
source "$ROOT_DIR/scripts/vps/deploy.env"

REMOTE_USER="${REMOTE_USER:?set REMOTE_USER en scripts/vps/deploy.env}"
REMOTE_HOST="${REMOTE_HOST:?set REMOTE_HOST en scripts/vps/deploy.env}"
REMOTE_PORT="${REMOTE_PORT:-22}"
SSH_KEY="${SSH_KEY:-}"
REMOTE_WEB_DIR="${REMOTE_WEB_DIR:?set REMOTE_WEB_DIR en scripts/vps/deploy.env}"

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
LOCAL_BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --yes|-y)   AUTO_YES=1 ;;
    --dry-run)  DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --no-local-backup) LOCAL_BACKUP=0 ;;
    *) echo "❌ Argumento desconocido: $arg" >&2; exit 1 ;;
  esac
done

SSH_OPTS=(-p "$REMOTE_PORT")
[ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")

# El script hace varias llamadas ssh sueltas (backup remoto, tar local,
# purga, chmod) más el rsync final — sin multiplexar, cada una abre su
# propia conexión TCP+handshake SSH desde cero. Con ControlMaster, la
# primera conexión (el check de abajo) queda abierta y todas las
# siguientes, incluida la que usa rsync -e, la reusan.
CONTROL_PATH="$(mktemp -u /tmp/web-pmo-deploy-ssh-XXXXXX.sock)"
SSH_OPTS+=(-o ControlMaster=auto -o ControlPersist=120 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ControlPath="$CONTROL_PATH")
close_ssh_master() { ssh -O exit -o ControlPath="$CONTROL_PATH" "$REMOTE_USER@$REMOTE_HOST" 2>/dev/null || true; }
trap close_ssh_master EXIT

RSYNC_SSH="ssh -p $REMOTE_PORT -o ControlMaster=auto -o ControlPersist=120 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ControlPath=$CONTROL_PATH"
[ -n "$SSH_KEY" ] && RSYNC_SSH="$RSYNC_SSH -i $SSH_KEY"

BUILD_DIR="$ROOT_DIR/dist/project-pmo/browser"

echo "==> Verificando conexión SSH (se reusa esta misma conexion para todo el resto del deploy)"
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
# cp -al (hardlinks) en vez de cp -a: mismo filesystem remoto, así que el
# respaldo es instantáneo (solo entradas de directorio, cero I/O de contenido
# real) en vez de duplicar cada archivo byte a byte.
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "test -d '$REMOTE_WEB_DIR' && cp -al '$REMOTE_WEB_DIR' '$BACKUP_DIR' || mkdir -p '$REMOTE_WEB_DIR'"

if [ "${LOCAL_BACKUP:-1}" -eq 1 ]; then
  echo "==> Bajando copia local de ese backup (por si se pierde acceso al VPS o se borra el remoto)"
  LOCAL_BACKUP_DIR="$ROOT_DIR/backups/$TS"
  mkdir -p "$LOCAL_BACKUP_DIR"
  ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
    "tar czf - -C '$(dirname "$BACKUP_DIR")' '$(basename "$BACKUP_DIR")'" \
    > "$LOCAL_BACKUP_DIR/web_backup.tar.gz"
  du -sh "$LOCAL_BACKUP_DIR/web_backup.tar.gz" 2>/dev/null | sed 's/^/    /'
else
  echo "==> --no-local-backup: se omite la copia local (queda el respaldo remoto $BACKUP_DIR)"
fi

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
  "chmod -R u=rwX,go=rX '$REMOTE_WEB_DIR'" || true

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
echo "   Rollback si algo sale mal: scripts/vps/rollback-vps.sh $TS"
