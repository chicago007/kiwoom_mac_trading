#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo ".env가 없습니다. 먼저 복사하세요: cp .env.example .env"
  exit 1
fi

if [[ ! -x backend/.venv/bin/uvicorn ]]; then
  python3 -m venv backend/.venv
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
  pip install -e backend
else
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
fi

if [[ ! -d frontend/node_modules ]]; then
  (cd frontend && npm install)
fi

echo
echo "화면  http://127.0.0.1:3010"
echo "API   http://127.0.0.1:8010/docs"
echo "Ctrl+C 하면 둘 다 종료됩니다."
echo

stop() {
  trap - INT TERM EXIT
  if [[ -n "${api_pid:-}" ]]; then kill "$api_pid" 2>/dev/null || true; fi
  if [[ -n "${ui_pid:-}" ]]; then kill "$ui_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap stop INT TERM EXIT

(
  cd backend
  uvicorn app.main:app --reload --host 127.0.0.1 --port 8010 --timeout-graceful-shutdown 1
) 2>&1 | sed -u 's/^/[api] /' &
api_pid=$!

(
  cd frontend
  npm run dev
) 2>&1 | sed -u 's/^/[ui]  /' &
ui_pid=$!

wait "$api_pid" "$ui_pid"
