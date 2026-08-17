#!/bin/bash
# ติดตั้ง CIT backend/frontend + MySQL ให้รันตอนบูต (ไม่ต้องล็อกอิน)
# เรียกด้วย: sudo bash deploy/install-boot-services.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "รันด้วย: sudo bash $0"
  exit 1
fi

REAL_USER="${SUDO_USER:-mawell-03}"
REAL_HOME=$(eval echo "~$REAL_USER")
ROOT="$REAL_HOME/CIT"
LAUNCHD_SRC="$ROOT/deploy/launchd"
LOG_DIR="$ROOT/deploy/logs"
BREW="/opt/homebrew/bin/brew"
MYSQL_PLIST_SRC="/opt/homebrew/opt/mysql@8.0/homebrew.mxcl.mysql@8.0.plist"
MYSQL_LABEL="homebrew.mxcl.mysql@8.0"

mkdir -p "$LOG_DIR"
chown "$REAL_USER:staff" "$LOG_DIR"

echo "==> ย้าย MySQL ไป system LaunchDaemon"
# ถอด user agent
USER_UID=$(id -u "$REAL_USER")
launchctl bootout "gui/${USER_UID}/${MYSQL_LABEL}" 2>/dev/null || true
rm -f "$REAL_HOME/Library/LaunchAgents/${MYSQL_LABEL}.plist"

if [[ ! -f "$MYSQL_PLIST_SRC" ]]; then
  echo "ไม่พบ $MYSQL_PLIST_SRC"
  exit 1
fi
cp "$MYSQL_PLIST_SRC" "/Library/LaunchDaemons/${MYSQL_LABEL}.plist"
# ให้ MySQL รันเป็น user จริง (data dir อยู่ใน /opt/homebrew/var/mysql ของ user)
/usr/libexec/PlistBuddy -c "Delete :UserName" "/Library/LaunchDaemons/${MYSQL_LABEL}.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UserName string $REAL_USER" "/Library/LaunchDaemons/${MYSQL_LABEL}.plist"
chown root:wheel "/Library/LaunchDaemons/${MYSQL_LABEL}.plist"
chmod 644 "/Library/LaunchDaemons/${MYSQL_LABEL}.plist"
launchctl bootout "system/${MYSQL_LABEL}" 2>/dev/null || true
launchctl bootstrap system "/Library/LaunchDaemons/${MYSQL_LABEL}.plist"
launchctl enable "system/${MYSQL_LABEL}"
launchctl kickstart -k "system/${MYSQL_LABEL}"
sleep 2

echo "==> ติดตั้ง CIT backend / frontend"
cp "$LAUNCHD_SRC/com.cit.backend.plist" /Library/LaunchDaemons/
cp "$LAUNCHD_SRC/com.cit.frontend.plist" /Library/LaunchDaemons/
chown root:wheel /Library/LaunchDaemons/com.cit.backend.plist /Library/LaunchDaemons/com.cit.frontend.plist
chmod 644 /Library/LaunchDaemons/com.cit.backend.plist /Library/LaunchDaemons/com.cit.frontend.plist

launchctl bootout system/com.cit.backend 2>/dev/null || true
launchctl bootout system/com.cit.frontend 2>/dev/null || true
launchctl bootstrap system /Library/LaunchDaemons/com.cit.backend.plist
launchctl bootstrap system /Library/LaunchDaemons/com.cit.frontend.plist
launchctl enable system/com.cit.backend
launchctl enable system/com.cit.frontend
launchctl kickstart -k system/com.cit.backend
sleep 2
launchctl kickstart -k system/com.cit.frontend

echo "==> สถานะ"
launchctl print system/"${MYSQL_LABEL}" 2>&1 | head -10
echo "---"
launchctl print system/com.cit.backend 2>&1 | head -10
echo "---"
launchctl print system/com.cit.frontend 2>&1 | head -10
echo "---"
sleep 2
curl -s -o /dev/null -w "backend  :4000  -> %{http_code}\n" http://127.0.0.1:4000/ || true
curl -s -o /dev/null -w "frontend :5173  -> %{http_code}\n" http://127.0.0.1:5173/ || true
echo "ล็อก: $LOG_DIR"
echo "เสร็จแล้ว"
