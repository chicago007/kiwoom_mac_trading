# backend

Mac용 키움 REST API 기반 미국주식 수동매매 웹앱 0.11 API입니다. `KIWOOM_ENABLED=true`이면 시세·호가·차트·예수금·잔고·기간 거래내역을 키움에서 가져옵니다. 주문은 `KIWOOM_ORDERS_ENABLED=true`일 때만 나갑니다. 전략 API는 없습니다.

`/`와 화면 경로는 UI(`http://127.0.0.1:3010`)로 넘깁니다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010 --timeout-graceful-shutdown 1
```

문서: http://127.0.0.1:8010/docs
