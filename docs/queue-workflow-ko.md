# 60점 이상 후보를 career-ops로 넘기는 워크플로우

## 목표

`/Users/lewis/Desktop/agent`에서 배치로 수집한 공고 중 점수 60점 이상인 항목만 골라서 `/Users/lewis/Desktop/career/career-ops`의 CV Editor로 불러온다.

Editor 화면에서는:

1. 왼쪽 패널에 공고 설명(`description`) 또는 평가 리포트를 보여준다.
2. 오른쪽 패널에서 CV HTML을 편집한다.
3. `Generate` 버튼을 누르면 `career-ops oferta`와 `career-ops pdf`를 순서대로 실행한다.
4. 결과 리포트와 PDF를 다시 파일 시스템에 저장한다.

---

## 결론

- **핵심 구현은 `career-ops` 쪽에서 한다.**
- **`agent` 쪽은 60점 이상 후보를 뽑아서 queue로 내보내는 역할만 한다.**
- **DB는 지금 단계에서는 필수 아님.**
- **파일 기반 queue + 로컬 API 1개**로 충분하다.

---

## 왜 이렇게 나누는가

### `agent`가 맡을 일

- 배치 실행
- 스코어 계산
- 60점 이상 후보 선별
- 후보 데이터를 queue 파일로 export

### `career-ops`가 맡을 일

- queue 읽기
- 후보를 화면에 표시
- description 또는 report를 왼쪽 패널에 렌더링
- Generate 버튼 처리
- `oferta` 실행
- `pdf` 실행
- 결과 저장

이렇게 나누면 각 저장소의 책임이 분명해진다.

---

## DB가 필요한가

### 현재 답

**아니다. 지금은 DB 없이도 충분하다.**

### 이유

- 이미 프로젝트 전반이 파일 기반이다.
  - `reports/`
  - `output/html/`
  - `output/`
  - `batch/`
- 이 기능은 1인 로컬 워크플로우에 가깝다.
- 상태 추적은 JSONL이나 TSV 파일로도 충분하다.
- 나중에 SQLite로 바꾸는 것은 어렵지 않다.

### DB가 유리해지는 시점

- 작업 이력이 많아질 때
- 재시도/상태 관리가 복잡해질 때
- 여러 사용자가 동시에 쓰는 도구로 확장할 때
- 감사 로그나 검색 기능이 중요해질 때

지금은 그 단계가 아니다.

---

## 추천 구조

### 1. `agent` 쪽

배치가 끝나면 60점 이상 항목을 queue 파일에 기록한다.

추천 포맷:

- `jsonl`
- 또는 `tsv`

추천 필드:

```json
{
  "id": "123",
  "company": "McCoin",
  "role": "Senior Crypto Wallet Ops",
  "score": 68,
  "description": "...",
  "url": "...",
  "source": "linkedin",
  "collected_at": "2026-04-27T12:00:00Z"
}
```

### 2. `career-ops` 쪽

`pdf-editor-server.mjs`가 queue를 읽어서 화면에 보여준다.

화면 동작:

- 후보 클릭
- 왼쪽 패널에 description 또는 report 표시
- 오른쪽 패널에 CV 편집기 표시
- `Generate` 클릭 시 평가/생성 실행

---

## 전체 흐름

1. `/Users/lewis/Desktop/agent`에서 배치 실행
2. 60점 이상 후보를 queue 파일에 저장
3. `/Users/lewis/Desktop/career/career-ops`가 queue 파일을 읽음
4. CV Editor에서 후보 목록 표시
5. 후보를 클릭하면 description이 왼쪽 패널에 표시됨
6. 오른쪽 패널에서 CV를 수정
7. `Generate` 버튼 클릭
8. 서버가 순서대로 실행
   - `career-ops oferta`
   - `career-ops pdf`
9. report / HTML / PDF 저장
10. 화면 갱신

---

## 구현 위치

### `agent`

아래 파일에서 queue export를 추가하는 쪽이 자연스럽다.

- [`/Users/lewis/Desktop/agent/src/watch/scraper.py`](/Users/lewis/Desktop/agent/src/watch/scraper.py)
- [`/Users/lewis/Desktop/agent/src/utils/models.py`](/Users/lewis/Desktop/agent/src/utils/models.py)
- [`/Users/lewis/Desktop/agent/src/utils/db.py`](/Users/lewis/Desktop/agent/src/utils/db.py)
- [`/Users/lewis/Desktop/agent/src/api/app.py`](/Users/lewis/Desktop/agent/src/api/app.py)
- 필요하면 [`/Users/lewis/Desktop/agent/src/services/career_bridge.py`](/Users/lewis/Desktop/agent/src/services/career_bridge.py)

### `career-ops`

아래 파일에서 reader, UI, 실행 라우트를 추가하는 쪽이 자연스럽다.

- [`/Users/lewis/Desktop/career/career-ops/modes/pdf-editor-server.mjs`](/Users/lewis/Desktop/career/career-ops/modes/pdf-editor-server.mjs)
- [`/Users/lewis/Desktop/career/career-ops/modes/oferta.md`](/Users/lewis/Desktop/career/career-ops/modes/oferta.md)
- [`/Users/lewis/Desktop/career/career-ops/modes/pdf.md`](/Users/lewis/Desktop/career/career-ops/modes/pdf.md)
- 필요하면 [`/Users/lewis/Desktop/career/career-ops/evaluation-engine.mjs`](/Users/lewis/Desktop/career/career-ops/evaluation-engine.mjs)

---

## 추천 API

`career-ops` 로컬 서버에 아래 라우트를 추가하는 안이 좋다.

- `GET /api/queue`
  - 60점 이상 후보 목록 조회
- `GET /api/candidate/:id`
  - 단일 후보의 description, 회사명, 역할, 점수 조회
- `POST /api/import-queue`
  - agent 쪽 queue를 가져와서 editor가 읽을 수 있게 저장
- `POST /api/generate`
  - 선택한 후보를 기준으로 `oferta`와 `pdf`를 순서대로 실행

---

## 화면 구조

### 메인

- 상단 탭
  - `Evaluate JD`
  - `Saved CVs`
  - `Queue` 또는 `Review Queue`

### Queue 탭

- 후보 목록
- company
- role
- score
- source
- created time
- status

### Editor 화면

- 왼쪽 패널
  - description
  - 또는 report
- 오른쪽 패널
  - 편집 가능한 CV HTML
- 상단 또는 하단
  - `Generate` 버튼

---

## Generate 버튼 동작

버튼을 누르면 서버가 아래 순서로 실행한다.

1. 선택한 description과 메타데이터를 준비한다.
2. `career-ops oferta`를 실행한다.
3. 생성된 report를 읽는다.
4. `career-ops pdf`를 실행한다.
5. 생성된 HTML/PDF 경로를 화면에 반영한다.

중요한 점:

- `oferta`가 먼저다.
- 그 다음 `pdf`다.
- 실행 순서를 뒤집지 않는다.

---

## 추천 작업 순서

### 1단계

- `agent`에서 60점 이상 항목을 queue 파일로 export

### 2단계

- `career-ops`에서 queue reader 추가

### 3단계

- editor 화면에 Queue 탭 추가

### 4단계

- 후보 클릭 시 description을 좌측 패널에 렌더링

### 5단계

- `Generate` 버튼 추가

### 6단계

- `oferta -> pdf` 실행 연결

### 7단계

- 생성된 report / PDF / HTML 저장 경로를 UI에 표시

---

## 권장 파일 계약

공유 파일은 이런 형식이 가장 단순하다.

```json
[
  {
    "id": "123",
    "company": "McCoin",
    "role": "Senior Crypto Wallet Ops",
    "score": 68,
    "description": "....",
    "url": "https://...",
    "source": "linkedin"
  }
]
```

더 많이 쌓이면:

- `jsonl` 유지
- 후보 하나당 한 줄
- append가 쉽고 충돌이 적다

---

## 최종 추천

- **기능 중심은 `career-ops`**
- **입력 생산은 `agent`**
- **DB는 나중**
- **파일 기반 queue로 시작**
- **로컬 API는 `career-ops` 서버에 추가**
