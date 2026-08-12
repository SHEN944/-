#!/usr/bin/env bash
# ============================================================
# 旅途手账 · 本地预览启动脚本（开发测试专用，零延迟同步代码）
# 用法：./scripts/preview-start.sh [PORT]
# 特性：
#   ① 端口默认 8000，冲突自动+1探测空闲
#   ② 记录完整 PID + 启动命令，用于一键 stop/restart
#   ③ 清空代理环境变量（HTTP_PROXY/HTTPS_PROXY）防止 Clash 注入引发连接重置
#   ④ 代码改动无需重启：python http.server 每次读文件，天然热加载
#   ⑤ 健康自检：启动后 3s 内用 curl 验证 HTTP 200，启动失败自动提示原因
# ============================================================
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT=${1:-${TRAVEL_PREVIEW_PORT:-8000}}
MAX_PORT=$((PORT + 10))
PID_FILE="$ROOT_DIR/.preview.pid"
LOG_FILE="$ROOT_DIR/.preview.log"
URL_FILE="$ROOT_DIR/.preview.url"

# --- 端口冲突处理 ---
while [ "$PORT" -lt "$MAX_PORT" ]; do
  if command -v ss >/dev/null 2>&1; then
    LISTEN=$(ss -tlnp "sport = :$PORT" 2>/dev/null | grep -c ":$PORT")
  elif command -v netstat >/dev/null 2>&1; then
    LISTEN=$(netstat -tlnp 2>/dev/null | awk '{print $4}' | grep -c ":$PORT$")
  else
    LISTEN=0
    (echo > /dev/tcp/127.0.0.1/$PORT) 2>/dev/null && LISTEN=1 || LISTEN=0
  fi
  if [ "$LISTEN" -eq 0 ]; then break; fi
  # 如果是之前的预览进程占用，尝试复用
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      OLD_CMD=$(ps -o args= -p "$OLD_PID" 2>/dev/null || true)
      if echo "$OLD_CMD" | grep -qE "python.*http\.server|python.*-m http"; then
        URL="http://127.0.0.1:$PORT/"
        echo "✅ 复用已在运行的预览进程 PID=$OLD_PID，监听端口 $PORT"
        echo "👉 直接访问：$URL"
        echo "$OLD_PID" > "$PID_FILE"
        echo "$URL"   > "$URL_FILE"
        exit 0
      fi
    fi
  fi
  echo "⚠️  端口 $PORT 已被占用，试下一个..."
  PORT=$((PORT + 1))
done
if [ "$PORT" -ge "$MAX_PORT" ]; then
  echo "❌ 端口 $((MAX_PORT-10))~$((MAX_PORT-1)) 全部被占，手动指定端口吧："
  echo "   ./scripts/preview-start.sh 9000"
  exit 1
fi

# --- 清理之前死掉的 PID 文件 ---
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null)
  if [ -n "${OLD_PID:-}" ] && ! kill -0 "$OLD_PID" 2>/dev/null; then
    rm -f "$PID_FILE"
  fi
fi

# --- 核心：清空代理再启动（根除 Clash/代理引发 Connection Reset） ---
export HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" no_proxy="localhost,127.0.0.1" NO_PROXY="localhost,127.0.0.1"

nohup python3 -u -m http.server "$PORT" --bind 0.0.0.0 --directory "$ROOT_DIR" > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
URL="http://127.0.0.1:$PORT/"
echo "$URL"  > "$URL_FILE"
sleep 2

# --- 健康自检 ---
STATUS=$(curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "✅ 本地预览服务启动成功！"
  echo "   PID : $PID"
  echo "   URL : $URL"
  echo "   日志: $LOG_FILE"
  echo ""
  echo "   👉 热代码同步：修改 app.js/index.html/styles.css 后不用重启，浏览器 Ctrl+R 刷新即可读到最新"
  echo "   👉 停止：./scripts/preview-stop.sh"
  echo "   👉 重启：./scripts/preview-restart.sh"
  echo "   👉 健康检查（双通道）：./scripts/preview-health.sh"
else
  echo "❌ 启动异常，HTTP 状态=$STATUS，日志尾部："
  tail -30 "$LOG_FILE" 2>/dev/null || echo "(日志不可读)"
  exit 2
fi
