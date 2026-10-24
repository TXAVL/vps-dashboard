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
    FORCE=0
    if [ "${2:-}" = "--force" ] || [ "${2:-}" = "-f" ]; then
      FORCE=1
    fi

    echo "🔍 Đang kiểm tra phiên bản ZenPanel..."
    CURRENT_VER=""
    if [ -f "$APP_DIR/agent/package.json" ]; then
      CURRENT_VER=$(node -e "try { console.log(require('$APP_DIR/agent/package.json').version || ''); } catch(e){}" 2>/dev/null || true)
    fi

    REMOTE_INFO=$(curl -fsSL --connect-timeout 8 "https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/package.json" 2>/dev/null || true)
    REMOTE_VER=""
    if [ -n "$REMOTE_INFO" ]; then
      REMOTE_VER=$(node -e "try { console.log(JSON.parse(process.argv[1]).version || ''); } catch(e){}" "$REMOTE_INFO" 2>/dev/null || true)
    fi

    if [ "$FORCE" -eq 0 ] && [ -n "$CURRENT_VER" ] && [ -n "$REMOTE_VER" ]; then
      IS_NEWER=$(node -e "
        function cmp(a, b) {
          const pa = a.split('.').map(Number);
          const pb = b.split('.').map(Number);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const diff = (pa[i] || 0) - (pb[i] || 0);
            if (diff !== 0) return diff > 0 ? 1 : -1;
          }
          return 0;
        }
        console.log(cmp('$REMOTE_VER', '$CURRENT_VER') > 0 ? 'yes' : 'no');
      " 2>/dev/null || echo "no")

      if [ "$IS_NEWER" = "no" ]; then
        echo ""
        echo "================================================================"
        echo "✔ ZenPanel đang ở phiên bản mới nhất (v$CURRENT_VER)!"
        echo "  Không có bản cập nhật mới cần cài đặt."
        echo "================================================================"
        echo ""
        echo "💡 Mẹo: Nếu bạn muốn cài đè hoặc ép buộc cập nhật lại, hãy dùng:"
        echo "  zenpanel update --force"
        exit 0
      fi

      echo ""
      echo "✨ Phát hiện phiên bản mới: v$CURRENT_VER ➔ v$REMOTE_VER"
      echo "🚀 Bắt đầu tiến trình cập nhật ZenPanel..."
      echo ""
    elif [ "$FORCE" -eq 1 ]; then
      echo ""
      echo "⚡ Chế độ ép buộc (--force): Bắt đầu cài đè/cập nhật lại ZenPanel..."
      echo ""
    else
      echo "Bắt đầu tải và chạy trình cài đặt ZenPanel..."
    fi

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
    echo "  zenpanel update [--force]  Kiểm tra và cập nhật ZenPanel (--force để cài đè)"
    ;;
  *)
    echo "Lệnh không hợp lệ: '$1'"
    echo "Sử dụng: zenpanel {status|start|stop|restart|logs|url|reset-password [mật-khẩu]|update}"
    ;;
esac
