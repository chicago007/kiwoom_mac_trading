# 앱 API (0.1)

호스트: `http://127.0.0.1:8010`  
OpenAPI: `/docs`

키움 TR을 감싼 **이 웹앱의 백엔드**입니다. `KIWOOM_ENABLED=false`이면 목업입니다. 전략 API는 없습니다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/health` | 버전, 키움 연결, 주문 목업/실주문 |
| GET | `/api/state` | 화면 전체 상태 |
| GET/POST | `/api/watchlists` | 그룹 목록 / 생성 |
| DELETE | `/api/watchlists/{id}` | 그룹 삭제 |
| POST | `/api/watchlists/{id}/items` | 종목 추가 |
| DELETE | `/api/watchlists/{id}/items/{itemId}` | 종목 제거 |
| POST | `/api/watchlists/{id}/items/{itemId}/toggle` | 사용 여부 |
| POST | `/api/watchlists/{id}/import-kiwoom` | HTS 관심 가져오기 (`usa20200/20201`) |
| GET | `/api/symbols/search?q=` | 티커 검색 |
| GET | `/api/quotes?stk_cd=&stex_tp=` | 현재가·10호가 (`usa20100` + `usa20101`/`FT`) |
| GET | `/api/quotes/live?stk_cd=&stex_tp=` | 캐시+실시간 호가 스냅샷 |
| GET | `/api/quotes/stream?stk_cd=&stex_tp=` | SSE (FT 스냅샷) |
| GET | `/api/charts?stk_cd=&stex_tp=&interval=` | 차트. `interval`은 `1`/`5`/`D` (`usa06011`/`usa06012`) |
| GET | `/api/markets` | 대시보드 시장 지표 |
| GET/POST | `/api/orders` | 주문 목록 / 수동 주문 |
| POST | `/api/orders/{ord_no}/modify` | 정정 |
| POST | `/api/orders/{ord_no}/cancel` | 취소 |
| GET | `/api/account/deposit` | 예수금 |
| GET | `/api/account/positions` | 잔고 |
| POST | `/api/system/kill` | 킬스위치 |
| POST | `/api/system/mode` | real / demo |
| PATCH | `/api/system/settings` | 한도 |

주문 body에는 `client_order_id`를 넣을 수 있습니다. 실주문은 `KIWOOM_ORDERS_ENABLED=true`와 2단계 확인이 필요합니다.

브라우저에서 `http://127.0.0.1:8010/` 또는 `/trade`, `/orders`, `/watchlists` 등 화면 경로로 들어오면 `http://127.0.0.1:3010`으로 넘깁니다. `/orders`·`/portfolio`는 `/trade`입니다.
