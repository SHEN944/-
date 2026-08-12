#!/usr/bin/env bash
# ============================================================
# 旅途手账 · 双通道健康检查
# 用法：./scripts/preview-health.sh [--fix]   加 --fix 通道 B 挂了自动重启
# ============================================================
set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
FIX=0; [ "${1:-}" = "--fix" ] && FIX=1
REMOTE_URL="https://shen944.github.io/-/"
PID_FILE="$ROOT_DIR/.preview.pid"
URL_FILE="$ROOT_DIR/.preview.url"
LOCAL_URL="$(cat "$URL_FILE" 2>/dev/null || echo 'http://127.0.0.1:8000/')"
RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[0;33m'; NC='\033[0m'

check_url() {  # $1=name  $2=url  $3=timeout_s
  local name="$1" url="$2" t="$3"
  local RES=$(curl -sL --max-time "$t" --connect-timeout $((t-1)) \
                    -o /tmp/preview-health-body.$$ -w "HTTP=%{http_code}  BYTES=%{size_download}  TOTAL=%{time_total}s  CONNECT=%{time_connect}s  TLS=%{time_appconnect}s" \
                    "$url?v=hc-$$-$RANDOM" 2>/dev/null)
  local HTTP=$(echo "$RES" | sed -n 's/.*HTTP=\([0-9]*\).*/\1/p')
  local BODY_OK=0
  [ -s /tmp/preview-health-body.$$ ] && grep -q "旅途手账" /tmp/preview-health-body.$$ 2>/dev/null && BODY_OK=1
  rm -f /tmp/preview-health-body.$$
  if [ "${HTTP:-000}" = "200" ] && [ "$BODY_OK" = "1" ]; then
    printf "  ${GRN}✅${NC} %-14s %s\n" "$name" "$RES"
    return 0
  else
    printf "  ${RED}❌${NC} %-14s %s  BODY_VALID=%s\n" "$name" "$RES" "$BODY_OK"
    return 1
  fi
}

echo "┌──────────────────────────────────────────────────────────────────────┐"
echo "│  旅途手账 · 双通道健康检查      $(date '+%Y-%m-%d %H:%M:%S')"
echo "└──────────────────────────────────────────────────────────────────────┘"
echo ""
REMOTE_OK=0; LOCAL_OK=0
check_url "远程 Pages"   "$REMOTE_URL"  15 && REMOTE_OK=1
check_url "本地预览"     "$LOCAL_URL"   5  && LOCAL_OK=1

echo ""
echo "【结果判定】"
if [ $REMOTE_OK -eq 1 ] && [ $LOCAL_OK -eq 1 ]; then
  printf "  ${GRN}🟢 双通道全健康${NC}：开发&测试随便走哪个都行\n"
  echo "  → 推荐：开发改代码刷 本地预览（零延迟），功能确认后再 push 走 Pages"
elif [ $REMOTE_OK -eq 0 ] && [ $LOCAL_OK -eq 1 ]; then
  printf "  ${YEL}🟡 通道降级${NC}：GitHub Pages 不可达，你本机运营商/代理可能阻断了 github.io\n"
  echo "  → 方案：全部测试走【本地预览】：$LOCAL_URL （代码改动实时同步）"
  echo "  → 修复 Pages：等网络恢复，或在本机挂代理后再用远程链接"
elif [ $REMOTE_OK -eq 1 ] && [ $LOCAL_OK -eq 0 ]; then
  printf "  ${YEL}🟡 本地预览没起${NC}：GitHub Pages 可达但本地无服务\n"
  if [ $FIX -eq 1 ]; then
    echo "  → --fix 模式：自动启动本地预览..."
    bash "$ROOT_DIR/scripts/preview-start.sh"
  else
    echo "  → 立即启动：$ROOT_DIR/scripts/preview-start.sh  （或加 --fix 再跑一遍本脚本）"
  fi
else
  printf "  ${RED}🔴 双通道全挂${NC}\n"
  echo "  → 代码文件校验："
  for f in index.html app.js styles.css; do
    if [ -f "$f" ]; then
      printf "    %-12s %8s bytes\n" "$f" "$(wc -c < "$f")"
    else
      printf "    %-12s ❌ 缺失\n" "$f"
    fi
  done
  [ $FIX -eq 1 ] && echo "  → --fix 模式：自动启动本地预览..." && bash "$ROOT_DIR/scripts/preview-start.sh"
fi
