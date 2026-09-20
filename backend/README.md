# backend

Mac용 키움 REST API 기반 미국주식 수동매매 웹앱 0.21 API입니다. `KIWOOM_ENABLED=true`이면 시세·호가·차트·예수금·잔고·기간 거래내역을 키움에서 가져옵니다. 주문은 `KIWOOM_ORDERS_ENABLED=true`일 때만 나갑니다. 전략 API는 없습니다.

키움증권 REST API를 이용하여 macOS에서 미국주식 시세·호가·잔고를 확인하고, 사용자가 직접 확인한 후 수동으로 주문할 수 있도록 만든 개인용 웹앱입니다. 본 프로젝트는 키움증권이 제공하거나 승인한 공식 HTS/WTS/MTS가 아니며, 키움증권과 제휴·협력 관계가 없습니다. 개발자 본인의 키움증권 계좌에서 개인적으로 사용하기 위해 만든 것이며, 제3자의 계좌 운용, 투자자문, 투자일임 또는 주문 대행을 목적으로 하지 않습니다.

`/`와 화면 경로는 UI(`http://127.0.0.1:3010`)로 넘깁니다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010 --timeout-graceful-shutdown 1
```

문서: http://127.0.0.1:8010/docs
