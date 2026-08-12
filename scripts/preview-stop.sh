#!/usr/bin/env bash
# ============================================================
# 旅途手账 · 本地预览停止脚本
# 特性：优先 PID 文件，其次特征匹配，最后兜底端口占用清理
# ============================================================
set -u
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.preview.pid"
URL_FILE="$ROOT_DIR/.preview.url"
LOG_FILE="$ROOT_DIR/.preview.log"

killed=0
# ① PID 文件优先
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    CMD=$(ps -o args= -p "$PID" 2>/dev/null || true)
    if echo "$CMD" | grep -qE "python.*http\.server|python.*-m http"; then
      kill "$PID" 2>/dev/null
      for i in 1 2 3 4 5; do
        kill -0 "$PID" 2>/dev/null || { killed=1; break; }
        sleep 0.3
      done
      if [ $killed -eq 0 ]; then
        kill -9 "$PID" 2>/dev/null; sleep 0.4
        kill -0 "$PID" 2>/dev/null || killed=1
      fi
      [ $killed -eq 1 ] && echo "✅ 已停止进程 PID=$PID（$CMD）"
    fi
  fi
fi

# ② 兜底：按命令行特征再杀一遍（防止 PID 文件残留错）
EXTRAS=$(pgrep -f "python.*http\.server.*travel|python.*-m http.*server.*$ROOT_DIR" 2>/dev/null || true)
for P in $EXTRAS; do
  if kill -0 "$P" 2>/dev/null; then
    kill -9 "$P" 2>/dev/null && echo "✅ 兜底杀掉特征匹配进程 PID=$P"
    killed=1
  fi
done

# ③ 清理临时文件
rm -f "$PID_FILE" "$URL_FILE"
[ $killed -eq 0 ] && echo "ℹ️  没有发现正在运行的预览服务"
echo ""
echo "  现在端口已释放，可重新启动：./scripts/preview-start.sh"
