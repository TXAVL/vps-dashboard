#!/usr/bin/env bash
# ZenPanel CLI (Linux) - được install.sh cài vào /usr/local/bin/zenpanel
APP_DIR="/opt/zenpanel"
DATA_DIR="/var/lib/zenpanel"
INSTALL_URL="https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.sh"

logs() {
  if command -v journalctl >/dev/null 2>&1; then journalctl -u zenpanel --no-pager -o cat "$@"
  else cat /var/log/zenpanel.log; fi
}

svc() {
  if command -v systemctl >/dev/null 2>&1; then systemctl "$1" zenpanel
  else rc-service zenpanel "$1"; fi
}

case "${1:-status}" in
  start | stop | restart | status) svc "$1" ;;
  logs)
    if command -v journalctl >/dev/null 2>&1; then journalctl -u zenpanel -f -o cat
    else tail -f /var/log/zenpanel.log; fi ;;
  url) logs 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1 ;;
  reset-password) cd "$APP_DIR/agent" && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/reset-password.js "${2:-}" ;;
  update) curl -fsSL "$INSTALL_URL" | bash ;;
  *) echo "Dùng: zenpanel {status|start|stop|restart|logs|url|reset-password [mật-khẩu]|update}" ;;
esac
