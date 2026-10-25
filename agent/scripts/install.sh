#!/usr/bin/env bash
# ZenPanel - Script cài đặt 1 dòng cho Linux (Ubuntu, Debian, CentOS/RHEL, Rocky, Alma, Fedora, Alpine)
#   curl -fsSL https://raw.githubusercontent.com/TXAVL/vps-dashboard/main/agent/scripts/install.sh | bash
# Biến môi trường tùy chọn: ZENPANEL_PORT (2083), ZENPANEL_BRANCH (main), ZENPANEL_TUNNEL (1)
set -euo pipefail

REPO="TXAVL/vps-dashboard"
BRANCH="${ZENPANEL_BRANCH:-main}"
PORT="${ZENPANEL_PORT:-2083}"
TUNNEL="${ZENPANEL_TUNNEL:-1}"
APP_DIR="/opt/zenpanel"
DATA_DIR="/var/lib/zenpanel"
NODE_MAJOR=22

green() { printf '\033[32m%s\033[0m\n' "$*"; }
blue() { printf '\033[34m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  red "Hãy chạy với quyền root: sudo bash install.sh"
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then PM=apt
elif command -v dnf >/dev/null 2>&1; then PM=dnf
elif command -v yum >/dev/null 2>&1; then PM=yum
elif command -v apk >/dev/null 2>&1; then PM=apk
else red "Không nhận diện được trình quản lý gói (apt/dnf/yum/apk)"; exit 1
fi

blue "🧘 ZenPanel installer — $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || uname -sr) · $(uname -m)"

step "Cài gói cơ bản (curl, tar, ca-certificates, cron)"
case "$PM" in
  apt) DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y curl tar ca-certificates cron >/dev/null && (systemctl enable --now cron >/dev/null 2>&1 || true) ;;
  dnf|yum) "$PM" install -y curl tar ca-certificates cronie >/dev/null && (systemctl enable --now crond >/dev/null 2>&1 || true) ;;
  apk) apk add --no-cache curl tar ca-certificates bash cronie >/dev/null && (rc-update add crond default >/dev/null 2>&1 || true; rc-service crond start >/dev/null 2>&1 || true) ;;
esac

node_ok() {
  command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]
}

step "Kiểm tra Node.js (cần >= 20)"
if node_ok; then
  green "Đã có Node.js $(node -v)"
else
  case "$PM" in
    apt)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
      DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null ;;
    dnf|yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
      "$PM" install -y nodejs >/dev/null ;;
    apk)
      apk add --no-cache nodejs npm >/dev/null ;;
  esac
  node_ok || { red "Cài Node.js thất bại. Hãy cài Node.js >= 20 thủ công rồi chạy lại."; exit 1; }
  green "Đã cài Node.js $(node -v)"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# ZENPANEL_ARCHIVE: gói phiên bản đã tải sẵn (do panel truyền vào khi cập nhật / quay lại bản cũ)
if [ -n "${ZENPANEL_ARCHIVE:-}" ] && [ -f "$ZENPANEL_ARCHIVE" ]; then
  step "Giải nén gói phiên bản $(basename "$ZENPANEL_ARCHIVE")"
  tar -xzf "$ZENPANEL_ARCHIVE" -C "$TMP"
else
  step "Tải mã nguồn ZenPanel ($REPO@$BRANCH)"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$TMP"
fi
SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n1)"
mkdir -p "$APP_DIR" "$DATA_DIR"
# Giữ nguyên node_modules cũ để cập nhật nhanh hơn
rm -rf "$APP_DIR/agent/src" "$APP_DIR/dashboard/src"
cp -a "$SRC/." "$APP_DIR/"

step "Build ZenPanel Agent"
cd "$APP_DIR/agent"
npm install --no-fund --no-audit --loglevel=error
npm run build --silent

step "Build ZenPanel Dashboard"
cd "$APP_DIR/dashboard"
npm install --no-fund --no-audit --loglevel=error
npm run build --silent

step "Đăng ký dịch vụ hệ thống"
NODE_BIN="$(command -v node)"
if command -v systemctl >/dev/null 2>&1; then
  cat >/etc/systemd/system/zenpanel.service <<EOF
[Unit]
Description=ZenPanel Agent - Universal VPS Control Panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR/agent
ExecStart=$NODE_BIN $APP_DIR/agent/dist/server.js
Environment=ZENPANEL_PORT=$PORT
Environment=ZENPANEL_TUNNEL=$TUNNEL
Environment=ZENPANEL_DATA_DIR=$DATA_DIR
KillMode=process
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable zenpanel >/dev/null 2>&1
  systemctl restart zenpanel
  LOG_CMD="journalctl -u zenpanel --no-pager -o cat --since=-3min"
elif command -v rc-service >/dev/null 2>&1; then
  cat >/etc/init.d/zenpanel <<EOF
#!/sbin/openrc-run
name="ZenPanel Agent"
command="$NODE_BIN"
command_args="$APP_DIR/agent/dist/server.js"
command_background=true
directory="$APP_DIR/agent"
pidfile="/run/zenpanel.pid"
output_log="/var/log/zenpanel.log"
error_log="/var/log/zenpanel.log"
export ZENPANEL_PORT=$PORT ZENPANEL_TUNNEL=$TUNNEL ZENPANEL_DATA_DIR=$DATA_DIR
depend() { need net; }
EOF
  chmod +x /etc/init.d/zenpanel
  : >/var/log/zenpanel.log
  rc-update add zenpanel default >/dev/null
  rc-service zenpanel restart >/dev/null
  LOG_CMD="cat /var/log/zenpanel.log"
else
  red "Không tìm thấy systemd hoặc OpenRC. Chạy thủ công: ZENPANEL_DATA_DIR=$DATA_DIR node $APP_DIR/agent/dist/server.js"
  exit 1
fi

step "Cài lệnh tắt: zenpanel và zpanel"
install -m 755 "$APP_DIR/agent/scripts/zenpanel.sh" /usr/local/bin/zenpanel
ln -sf /usr/local/bin/zenpanel /usr/local/bin/zpanel

step "Chờ ZenPanel khởi động và Cloudflare cấp domain"
for _ in $(seq 1 60); do
  if $LOG_CMD 2>/dev/null | grep -qE 'Public URL'; then break; fi
  sleep 2
done

# In lại khung thông tin (Public URL, Local, mật khẩu lần đầu) từ log của agent
$LOG_CMD 2>/dev/null | awk '/╭/{buf=""} {buf=buf $0 "\n"} /╰/{last=buf} END{printf "%s", last}'

url=""
if [ -f "$DATA_DIR/tunnel.url" ]; then
  url=$(cat "$DATA_DIR/tunnel.url" 2>/dev/null | tr -d '\r\n')
fi
if [ -z "$url" ]; then
  url=$($LOG_CMD 2>/dev/null | grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -n1)
fi

if [ -n "$url" ]; then
  login_url=$(cd "$APP_DIR/agent" 2>/dev/null && ZENPANEL_DATA_DIR="$DATA_DIR" node dist/cli/login-url.js "$url" 2>/dev/null || true)
  if [ -n "$login_url" ]; then
    echo ""
    green "🚀 Link đăng nhập 1-Click (Tự động login sang web mới không cần nhập mật khẩu):"
    echo "  $login_url"
  fi
fi

green "✔ Cài đặt ZenPanel hoàn tất!"
echo "  • Tự chạy lại khi khởi động lại VPS: đã bật"
echo "  • Lệnh nhanh: zenpanel status | restart | logs | url | reset-password | update"

