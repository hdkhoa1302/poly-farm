#!/usr/bin/env bash
# Deploy games-hub-api lên Cloudflare. Idempotent — chạy lại được nhiều lần.
#
#   ./deploy.sh            # tạo D1 (nếu chưa), nạp schema, deploy
#   ./deploy.sh --secrets  # chỉ đặt/đổi secrets
#
# Yêu cầu: đã `wrangler login`, và ở thư mục chứa wrangler.toml.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:$PATH"

DB_NAME="games-hub"

if ! wrangler whoami >/dev/null 2>&1; then
  echo "✗ Chưa đăng nhập Cloudflare. Chạy:  wrangler login"
  exit 1
fi

# ---------- secrets ----------
if [[ "${1:-}" == "--secrets" || ! -f .secrets-done ]]; then
  echo "→ Đặt secrets (đọc từ ~/.hermes/.env, không in ra màn hình)"
  BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$HOME/.hermes/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
  if [[ -z "$BOT_TOKEN" ]]; then
    echo "✗ Không đọc được TELEGRAM_BOT_TOKEN từ ~/.hermes/.env"; exit 1
  fi
  printf '%s' "$BOT_TOKEN" | wrangler secret put TELEGRAM_BOT_TOKEN >/dev/null
  echo "  ✓ TELEGRAM_BOT_TOKEN"

  if [[ -f .ingest-secret ]]; then
    INGEST=$(cat .ingest-secret)
  else
    INGEST=$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')
    printf '%s' "$INGEST" > .ingest-secret
    echo "  (đã tạo ingest secret, lưu ở worker/.ingest-secret — KHÔNG commit)"
  fi
  printf '%s' "$INGEST" | wrangler secret put INGEST_SECRET >/dev/null
  echo "  ✓ INGEST_SECRET"
  touch .secrets-done
fi

# ---------- D1 ----------
if grep -q 'database_id = "PLACEHOLDER"' wrangler.toml; then
  echo "→ Tạo D1 database '$DB_NAME'"
  OUT=$(wrangler d1 create "$DB_NAME" 2>&1 | tee /dev/stderr)
  ID=$(printf '%s' "$OUT" | grep -oE 'database_id = "[0-9a-f-]{36}"' | head -1 | cut -d'"' -f2 || true)
  if [[ -z "${ID:-}" ]]; then
    echo "✗ Không lấy được database_id. Nếu DB đã tồn tại, chạy 'wrangler d1 list' rồi dán id vào wrangler.toml"
    exit 1
  fi
  python3 - "$ID" <<'PY'
import re, sys
p = 'wrangler.toml'
s = open(p).read()
s = re.sub(r'database_id = "PLACEHOLDER"', f'database_id = "{sys.argv[1]}"', s)
open(p, 'w').write(s)
print('  ✓ đã ghi database_id vào wrangler.toml')
PY
fi

echo "→ Nạp schema (remote)"
wrangler d1 execute "$DB_NAME" --remote --file=./schema.sql >/dev/null
echo "  ✓ schema OK"

echo "→ Deploy Worker"
wrangler deploy 2>&1 | tail -5

echo
echo "→ Kiểm tra"
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' wrangler.toml 2>/dev/null | head -1 || true)
if [[ -z "$URL" ]]; then
  echo "  Lấy URL ở dòng 'Uploaded' phía trên, rồi:  curl <URL>/health"
fi
