#!/usr/bin/env bash
# ZenPanel CLI (Linux) - được install.sh cài vào /usr/local/bin/zenpanel & /usr/local/bin/zpanel
APP_DIR="/opt/zenpanel"
DATA_DIR="/var/lib/zenpanel"
INSTALL_URL="https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.sh"

logs() {
  if command -v journalctl >/dev/null 2>&1; then journalctl -u zenpanel --no-pager -o cat "$@"
  else cat /var/log/zenpanel.log; fi
}

svc() {
  local cmd="$1"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl "$cmd" zenpanel
  else
    rc-service zenpanel "$cmd"
  fi
}

ACTION="${1:-status}"

case "$ACTION" in
  start | stop | restart | status)
    svc "$ACTION"
    if [ "$ACTION" = "status" ]; then
      echo ""
      echo "=== ZenPanel Connection Info ==="
      url=$(logs 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1)
      if [ -n "$url" ]; then
        echo "Public URL: $url"
      else
        echo "Public URL: Đang kết nối hoặc chưa bật tunnel (kiểm tra: zenpanel logs)"
      fi
      local_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
      if [ -n "$local_ip" ]; then
        echo "Direct URL: http://${local_ip}:2083"
      fi
      echo ""
      echo "Lệnh tiện ích: zenpanel {status|start|stop|restart|logs|url|reset-password|update}"
    fi
    ;;
  logs)
    if command -v journalctl >/dev/null 2>&1; then journalctl -u zenpanel -f -o cat
    else tail -f /var/log/zenpanel.log; fi ;;
  url)
    logs 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1
    ;;
  reset-password)
    cd "$APP_DIR/agent" && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/reset-password.js "${2:-}"
    ;;
  update)
    curl -fsSL "$INSTALL_URL" | bash
    ;;
  help | -h | --help)
    echo "ZenPanel CLI - Quản trị ZenPanel VPS Dashboard"
    echo "Sử dụng: zenpanel [lệnh] (hoặc zpanel [lệnh])"
    echo ""
    echo "Danh sách lệnh:"
    echo "  zenpanel status            Xem trạng thái dịch vụ và link truy cập (Mặc định)"
    echo "  zenpanel start             Khởi động dịch vụ ZenPanel"
    echo "  zenpanel stop              Dừng dịch vụ ZenPanel"
    echo "  zenpanel restart           Khởi động lại dịch vụ ZenPanel"
    echo "  zenpanel logs              Xem log thời gian thực"
    echo "  zenpanel url               Lấy đường dẫn Cloudflare Tunnel"
    echo "  zenpanel reset-password    Đặt lại mật khẩu quản trị viên"
    echo "  zenpanel update            Cập nhật ZenPanel lên phiên bản mới nhất"
    ;;
  *)
    echo "Lệnh không hợp lệ: '$1'"
    echo "Sử dụng: zenpanel {status|start|stop|restart|logs|url|reset-password [mật-khẩu]|update}"
    ;;
esac
