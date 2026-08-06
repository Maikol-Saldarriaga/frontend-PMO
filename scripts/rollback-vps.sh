#!/usr/bin/env bash
# Rollback rápido de un deploy roto del frontend en el VPS.
#
# deploy-vps.sh, antes de cada rsync, respalda el contenido anterior de
# REMOTE_WEB_DIR a REMOTE_WEB_DIR.bak-<timestamp> en el propio VPS, y además
# baja copia local a backups/<timestamp>/web_backup.tar.gz. Este script
# restaura ese backup: si el .bak-<timestamp> remoto sigue ahí, lo usa
# directo; si no (se perdió, se purgó, o falta disco), sube la copia local
# automáticamente antes de restaurar.
#
# Antes de pisar el contenido actual del VPS, guarda un snapshot de "cómo
# estaba antes del rollback" en backups/pre-rollback_<timestamp-actual>/, por
# si hace falta mirar atrás.
#
# Uso:
#   scripts/rollback-vps.sh --list
#   scripts/rollback-vps.sh <timestamp> [--yes]
#
# Requiere scripts/deploy.env (mismo que deploy-vps.sh).

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

case "$REMOTE_WEB_DIR" in
  /*fodc*) : ;;
  *)
    echo "❌ REMOTE_WEB_DIR ('$REMOTE_WEB_DIR') no parece una ruta segura (se espera algo como /var/www/fodc). Abortando." >&2
    exit 1
    ;;
esac

SSH_OPTS=(-p "$REMOTE_PORT")
SCP_OPTS=(-P "$REMOTE_PORT")
[ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")
[ -n "$SSH_KEY" ] && SCP_OPTS+=(-i "$SSH_KEY")

REMOTE_PARENT_DIR="$(dirname "$REMOTE_WEB_DIR")"
REMOTE_BASE_NAME="$(basename "$REMOTE_WEB_DIR")"

if [ "${1:-}" = "--list" ]; then
  echo "==> Backups en el VPS ($REMOTE_USER@$REMOTE_HOST:$REMOTE_PARENT_DIR)"
  ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
    "cd '$REMOTE_PARENT_DIR' && ls -1dt '$REMOTE_BASE_NAME'.bak-* 2>/dev/null" \
    || echo "    (sin backups remotos todavía — corré deploy-vps.sh primero)"
  echo
  echo "==> Backups locales disponibles en $ROOT_DIR/backups"
  ls -1t "$ROOT_DIR/backups" 2>/dev/null | while read -r d; do
    [ -f "$ROOT_DIR/backups/$d/web_backup.tar.gz" ] && echo "$d"
  done
  exit 0
fi

TIMESTAMP="${1:-}"
[ -n "$TIMESTAMP" ] || { echo "Uso: $0 <timestamp> [--yes]  (o --list)"; exit 1; }
shift

AUTO_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=1 ;;
    *) echo "❌ Argumento desconocido: $arg" >&2; exit 1 ;;
  esac
done

REMOTE_BACKUP_DIR="${REMOTE_WEB_DIR}.bak-${TIMESTAMP}"
LOCAL_BACKUP_FILE="$ROOT_DIR/backups/$TIMESTAMP/web_backup.tar.gz"

echo "==> Verificando conexión SSH a $REMOTE_USER@$REMOTE_HOST"
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=8 "$REMOTE_USER@$REMOTE_HOST" true

echo "==> Verificando que el backup exista: $REMOTE_BACKUP_DIR"
if ! ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" "[ -d '$REMOTE_BACKUP_DIR' ]"; then
  echo "    No está en el VPS — buscando copia local en $LOCAL_BACKUP_FILE"
  [ -f "$LOCAL_BACKUP_FILE" ] || { echo "❌ No existe ese backup ni remoto ni local. Corré '$0 --list'."; exit 1; }
  echo "==> Resubiendo backup desde la copia local a $REMOTE_BACKUP_DIR"
  cat "$LOCAL_BACKUP_FILE" | ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
    "tar xzf - -C '$REMOTE_PARENT_DIR'"
fi

echo
echo "==> Se va a restaurar $REMOTE_WEB_DIR desde el backup de $TIMESTAMP"
echo "    (nginx y el resto de sitios del server quedan intactos)"
if [ "$AUTO_YES" -ne 1 ]; then
  read -r -p "Continuar? [y/N] " CONFIRM
  CONFIRM="${CONFIRM%$'\r'}"
  [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ] || { echo "Cancelado."; exit 1; }
fi

SAFETY_TS="$(date +%Y%m%d_%H%M%S)"
SAFETY_DIR="$ROOT_DIR/backups/pre-rollback_$SAFETY_TS"
mkdir -p "$SAFETY_DIR"

echo "==> Guardando snapshot de cómo está el VPS ANTES del rollback (por si hace falta mirar atrás)"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "tar czf - -C '$REMOTE_PARENT_DIR' '$REMOTE_BASE_NAME'" \
  > "$SAFETY_DIR/web_pre-rollback.tar.gz"
echo "    Snapshot guardado en $SAFETY_DIR/web_pre-rollback.tar.gz"

echo "==> Restaurando $REMOTE_WEB_DIR desde $REMOTE_BACKUP_DIR"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "rm -rf '$REMOTE_WEB_DIR' && mv '$REMOTE_BACKUP_DIR' '$REMOTE_WEB_DIR'"

echo "==> Asegurando permisos de lectura para nginx"
ssh "${SSH_OPTS[@]}" "$REMOTE_USER@$REMOTE_HOST" \
  "find '$REMOTE_WEB_DIR' -type d -exec chmod 755 {} \; 2>/dev/null; find '$REMOTE_WEB_DIR' -type f -exec chmod 644 {} \;" || true

echo
echo "==> Verificando que el sitio responde"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://fodcpmo.cloud/" || echo "curl_failed")"
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ https://fodcpmo.cloud/ respondió 200"
else
  echo "⚠️  https://fodcpmo.cloud/ respondió '$HTTP_CODE' (revisa manualmente antes de dar por bueno el rollback)"
fi

echo
echo "✅ Rollback OK: $REMOTE_WEB_DIR restaurado desde el backup de $TIMESTAMP"
