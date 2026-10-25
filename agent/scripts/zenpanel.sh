#!/usr/bin/env bash
# ZenPanel CLI (Linux) - được install.sh cài vào /usr/local/bin/zenpanel, /usr/local/bin/zpanel & /usr/local/bin/zen
APP_DIR="/opt/zenpanel"
DATA_DIR="/var/lib/zenpanel"
INSTALL_URL="https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.sh"
ACTION="${1:-status}"

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

get_tunnel_url() {
  local u=""
  if [ -f "$DATA_DIR/tunnel.url" ]; then
    u=$(cat "$DATA_DIR/tunnel.url" 2>/dev/null | tr -d '\r\n')
  fi
  if [ -z "$u" ]; then
    if command -v journalctl >/dev/null 2>&1; then
      u=$(journalctl -u zenpanel --no-pager -o cat --since="-5m" 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1)
    else
      u=$(tail -n 100 /var/log/zenpanel.log 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1)
    fi
  fi
  echo "$u"
}

update_website() {
  export PATH="/usr/local/bin:/usr/bin:$PATH"
  echo ""
  echo "🌐 Đang tiến hành cập nhật giao diện Website ZenPanel..."

  if [ ! -d "$APP_DIR/dashboard" ]; then
    echo "❌ Không tìm thấy thư mục $APP_DIR/dashboard!"
    exit 1
  fi

  TMP_UI=$(mktemp -d 2>/dev/null || mktemp -d -t 'zp_ui_XXXXXX')
  trap 'rm -rf "$TMP_UI"' EXIT

  echo "📥 Đang tải mã nguồn giao diện mới nhất từ GitHub..."
  if ! curl -fsSL --connect-timeout 15 "https://codeload.github.com/TXAVL/vps-dashboard/tar.gz/refs/heads/main" | tar -xz -C "$TMP_UI"; then
    echo "❌ Lỗi khi tải mã nguồn từ GitHub. Vui lòng kiểm tra kết nối mạng."
    exit 1
  fi

  SRC_UI=$(find "$TMP_UI" -mindepth 1 -maxdepth 1 -type d | head -n1)
  if [ -z "$SRC_UI" ] || [ ! -d "$SRC_UI/dashboard" ]; then
    echo "❌ Không tìm thấy thư mục dashboard trong mã nguồn tải về."
    exit 1
  fi

  echo "🔨 Đang đồng bộ tệp tin dashboard mới..."
  rm -rf "$APP_DIR/dashboard/src" "$APP_DIR/dashboard/public"
  cp -a "$SRC_UI/dashboard/src" "$APP_DIR/dashboard/"
  [ -d "$SRC_UI/dashboard/public" ] && cp -a "$SRC_UI/dashboard/public" "$APP_DIR/dashboard/"
  cp -a "$SRC_UI/dashboard/package.json" "$APP_DIR/dashboard/"
  [ -f "$SRC_UI/dashboard/index.html" ] && cp -a "$SRC_UI/dashboard/index.html" "$APP_DIR/dashboard/"
  [ -f "$SRC_UI/dashboard/vite.config.ts" ] && cp -a "$SRC_UI/dashboard/vite.config.ts" "$APP_DIR/dashboard/"

  # Cập nhật script CLI mới nhất nếu có
  [ -f "$SRC_UI/agent/scripts/zenpanel.sh" ] && cp -f "$SRC_UI/agent/scripts/zenpanel.sh" /usr/local/bin/zenpanel 2>/dev/null || true

  echo "⚡ Đang build lại giao diện Website (Vite)..."
  cd "$APP_DIR/dashboard"
  if ! (npm run build --silent || npm run build); then
    echo "❌ Build giao diện Website thất bại! Kiểm tra lỗi hiển thị bên trên."
    exit 1
  fi

  echo ""
  echo "================================================================"
  echo "✔ Cập nhật giao diện Website ZenPanel THÀNH CÔNG!"
  echo "✔ Dịch vụ không cần khởi động lại — GIỮ NGUYÊN 100% URL HIỆN TẠI!"
  echo "================================================================"
  current_url=$(get_tunnel_url)
  if [ -n "$current_url" ]; then
    echo "🔗 URL truy cập hiện tại: $current_url"
    login_url=$(cd "$APP_DIR/agent" 2>/dev/null && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/login-url.js "$current_url" 2>/dev/null || true)
    if [ -n "$login_url" ]; then
      echo "🚀 Link đăng nhập 1-Click (Tự động login sang web mới):"
      echo "   $login_url"
    fi
  fi
  local_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -n "$local_ip" ]; then
    echo "🔗 Direct URL: http://${local_ip}:2083"
    direct_login=$(cd "$APP_DIR/agent" 2>/dev/null && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/login-url.js "http://${local_ip}:2083" 2>/dev/null || true)
    if [ -n "$direct_login" ]; then
      echo "🚀 Link trực tiếp (Tự động login):"
      echo "   $direct_login"
    fi
  fi
  echo ""
  echo "👉 Chỉ cần tải lại (F5 / Ctrl+F5) trình duyệt để thấy thay đổi mới."
  echo "💡 Để cập nhật toàn bộ cả backend agent: zenpanel update --force"
  echo ""
}

case "$ACTION" in
  start | stop | restart | status)
    svc "$ACTION"
    if [ "$ACTION" = "status" ]; then
      echo ""
      echo "=== ZenPanel Connection Info ==="
      url=$(get_tunnel_url)
      if [ -n "$url" ]; then
        echo "Public URL: $url"
        login_url=$(cd "$APP_DIR/agent" 2>/dev/null && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/login-url.js "$url" 2>/dev/null || true)
        if [ -n "$login_url" ]; then
          echo "Auto-Login: $login_url"
        fi
      else
        echo "Public URL: Đang kết nối hoặc chưa bật tunnel (kiểm tra: zenpanel logs)"
      fi
      local_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
      if [ -n "$local_ip" ]; then
        echo "Direct URL: http://${local_ip}:2083"
        direct_login=$(cd "$APP_DIR/agent" 2>/dev/null && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/login-url.js "http://${local_ip}:2083" 2>/dev/null || true)
        if [ -n "$direct_login" ]; then
          echo "Direct-Login: $direct_login"
        fi
      fi
      echo ""
      echo "Lệnh tiện ích: zenpanel {status|start|stop|restart|logs|url|reset-password|update}"
    fi
    ;;
  logs)
    if command -v journalctl >/dev/null 2>&1; then journalctl -u zenpanel -f -o cat
    else tail -f /var/log/zenpanel.log; fi ;;
  url)
    if command -v systemctl >/dev/null 2>&1; then
      if ! systemctl is-active --quiet zenpanel; then
        echo "❌ Dịch vụ ZenPanel hiện đang KHÔNG chạy (stopped hoặc crashed)."
        echo "👉 Hãy chạy: zenpanel status hoặc zenpanel logs để kiểm tra lỗi."
        exit 1
      fi
    fi
    url=$(get_tunnel_url)
    if [ -n "$url" ]; then
      login_url=$(cd "$APP_DIR/agent" 2>/dev/null && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/login-url.js "$url" 2>/dev/null || true)
      if [ -n "$login_url" ]; then
        echo "$login_url"
      else
        echo "$url"
      fi
    else
      echo "⏳ Cloudflare Tunnel đang kết nối hoặc chưa cấp domain."
      echo "👉 Vui lòng chờ 5-10 giây rồi thử lại, hoặc kiểm tra: zenpanel logs"
    fi
    ;;
  reset-password)
    cd "$APP_DIR/agent" && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/reset-password.js "${2:-}"
    ;;
  update)
    SUB_OPT="${2:-}"

    # 1. Nếu người dùng chỉ định rõ 'ui', 'website' hoặc '--ui'
    if [ "$SUB_OPT" = "ui" ] || [ "$SUB_OPT" = "website" ] || [ "$SUB_OPT" = "--ui" ]; then
      update_website
      exit 0
    fi

    # 2. Kiểm tra cờ --force, -f, --full
    FORCE=0
    if [ "$SUB_OPT" = "--force" ] || [ "$SUB_OPT" = "-f" ] || [ "$SUB_OPT" = "--full" ] || [ "$SUB_OPT" = "full" ]; then
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
        echo "✔ Phiên bản hệ thống: v$CURRENT_VER (Chưa tăng số phiên bản)."
        echo "🚀 Tự động cập nhật giao diện Website ZenPanel từ GitHub & GIỮ NGUYÊN URL..."
        echo "================================================================"
        update_website
        exit 0
      fi

      echo ""
      echo "✨ Phát hiện phiên bản mới: v$CURRENT_VER ➔ v$REMOTE_VER"
      echo "🚀 Bắt đầu tiến trình cập nhật toàn diện ZenPanel..."
      echo ""
    elif [ "$FORCE" -eq 1 ]; then
      echo ""
      echo "⚡ Chế độ toàn diện (--force): Bắt đầu cài đè/cập nhật toàn bộ ZenPanel..."
      echo ""
    else
      echo "Bắt đầu tải và chạy trình cài đặt ZenPanel..."
    fi

    curl -fsSL "$INSTALL_URL" | bash
    ;;
  help | -h | --help)
    echo "ZenPanel CLI - Quản trị ZenPanel VPS Dashboard"
    echo "Sử dụng: zenpanel [lệnh] (hoặc zpanel [lệnh], zen [lệnh])"
    echo ""
    echo "Danh sách lệnh:"
    echo "  zenpanel status            Xem trạng thái dịch vụ và link truy cập (Mặc định)"
    echo "  zenpanel start             Khởi động dịch vụ ZenPanel"
    echo "  zenpanel stop              Dừng dịch vụ ZenPanel"
    echo "  zenpanel restart           Khởi động lại dịch vụ ZenPanel"
    echo "  zenpanel logs              Xem log thời gian thực"
    echo "  zenpanel url               Lấy đường dẫn Cloudflare Tunnel"
    echo "  zenpanel reset-password    Đặt lại mật khẩu quản trị viên"
    echo "  zenpanel update            Cập nhật ZenPanel (Tự động cập nhật website & giữ nguyên URL nếu phiên bản không đổi)"
    echo "  zenpanel update ui         Cập nhật nhanh giao diện Website và GIỮ NGUYÊN 100% URL hiện tại"
    echo "  zenpanel update --force    Cập nhật toàn bộ backend agent và khởi động lại dịch vụ"
    ;;
  *)
    echo "Lệnh không hợp lệ: '$1'"
    echo "Sử dụng: zenpanel {status|start|stop|restart|logs|url|reset-password [mật-khẩu]|update [ui|--force]} (hoặc zen / zpanel)"
    ;;
esac
