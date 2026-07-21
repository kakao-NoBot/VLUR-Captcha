# VLUR-Captcha

사용자에게는 간단하고 자연스러운 인증 경험을 제공하고, 서비스에는 자동화된 봇을 구분할 수 있는 검증 수단을 제공하는 AI CAPTCHA SaaS 프로젝트입니다.

> 이 저장소는 현재 초기 개발 단계입니다. FastAPI 백엔드의 상태 확인 및 데이터베이스 연결 확인 기능과 MySQL 스키마·개발용 시드 데이터가 구현되어 있습니다. 프런트엔드와 AI 서비스는 디렉터리 및 컨테이너 구성이 준비된 골격 단계입니다.

## 주요 기능

- 드래그 궤적을 활용하는 행동 기반 CAPTCHA (`type1_drag`) 설계
- 이미지와 레이블을 식별하는 선택형 CAPTCHA (`type2_identify`) 설계
- API 키 발급 및 활성 상태 관리
- 요금제별 API·CAPTCHA 사용량 한도 관리
- 검증 결과, 드래그 좌표, 봇 판정 결과 기록
- 결제 내역과 공지사항·Q&A 데이터 관리
- Docker Compose 기반 로컬 개발 환경

## 현재 구현 상태

| 영역 | 상태 | 내용 |
| --- | --- | --- |
| Backend | 기본 기능 구현 | FastAPI 서버, 상태 확인, DB 연결 확인 |
| Database | 구현 | MySQL 8.0 스키마와 개발용 시드 데이터 |
| Frontend | 준비 중 | 개발용 Dockerfile만 포함 |
| AI | 준비 중 | 서비스 디렉터리만 포함 |
| Kubernetes / Nginx | 준비 중 | 배포 구성을 위한 디렉터리만 포함 |

## 시스템 구성

```mermaid
flowchart LR
    U["사용자"] --> F["Frontend :5173"]
    F --> B["FastAPI Backend :8000"]
    B --> D[("MySQL 8.0 :3307")]
    B --> A["AI Service :5000"]
```

현재 로컬에서 바로 실행 가능한 범위는 `db`와 `backend` 서비스입니다. 전체 구성을 실행하려면 프런트엔드 애플리케이션 파일과 AI 서비스용 Dockerfile을 먼저 추가해야 합니다.

## 기술 스택

- Backend: Python 3.12, FastAPI, Uvicorn, PyMySQL
- Database: MySQL 8.0
- Frontend: Node.js 24 기반 개발 환경
- Infrastructure: Docker, Docker Compose
- Planned: AI inference service, Nginx, Kubernetes

## 디렉터리 구조

```text
AI-Captcha/
├── AI/                       # AI 추론 서비스 예정
├── backend/
│   ├── Dockerfile.dev
│   ├── main.py               # FastAPI 애플리케이션
│   └── requirements.txt
├── database/
│   └── init/
│       ├── 01_schema.sql     # 테이블 및 제약조건
│       └── 02_seed.sql       # 개발용 초기 데이터
├── frontend/
│   └── Dockerfile.dev        # 프런트엔드 개발 이미지
├── k8s/                      # Kubernetes 매니페스트 예정
├── nginx/                    # 리버스 프록시 설정 예정
├── docker-compose.yml
└── README.md
```

## 시작하기

### 사전 준비

- Git
- Docker Desktop 또는 Docker Engine
- Docker Compose v2

### 1. 저장소 복제

```bash
git clone https://github.com/kakao-NoBot/AI-Captcha.git
cd AI-Captcha
```

### 2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다.

```dotenv
DB_ROOT_PASSWORD=change-this-root-password
DB_NAME=captcha
DB_USER=captcha_user
DB_PASSWORD=change-this-db-password
DB_HOST=db
DB_PORT=3306
```

`.env` 파일은 Git에서 제외됩니다. 실제 비밀번호나 운영 환경의 비밀 값을 저장소에 커밋하지 마세요.

### 3. 데이터베이스와 백엔드 실행

```bash
docker compose up --build db backend
```

서비스가 준비되면 다음 주소에서 상태를 확인할 수 있습니다.

```bash
curl http://localhost:8000/health
curl http://localhost:8000/db-check
```

예상 상태 응답:

```json
{"status":"ok"}
```

FastAPI 자동 API 문서는 아래에서 확인할 수 있습니다.

- Swagger UI: <http://localhost:8000/docs>
- ReDoc: <http://localhost:8000/redoc>

### 4. 종료

```bash
docker compose down
```

MySQL 데이터는 `captcha_mysql_data` 볼륨에 유지됩니다. 스키마와 시드 데이터를 처음부터 다시 생성하려면 로컬 DB 데이터를 삭제한 뒤 재실행합니다.

```bash
docker compose down -v
docker compose up --build db backend
```

> `docker compose down -v`는 로컬 MySQL 볼륨의 데이터를 모두 삭제합니다.

## API

현재 제공되는 개발용 엔드포인트는 다음과 같습니다.

| Method | Endpoint | 설명 |
| --- | --- | --- |
| `GET` | `/health` | 백엔드 서버 상태 확인 |
| `GET` | `/db-check` | DB 테이블과 일부 시드 데이터 조회 |

`/db-check`는 데이터베이스 연결 검증을 위한 개발용 엔드포인트입니다. 사용자·CAPTCHA 데이터가 응답에 포함되므로 운영 환경에 그대로 노출하지 마세요.

## 데이터베이스

MySQL 볼륨이 처음 생성될 때 `database/init`의 SQL 파일이 이름순으로 한 번 실행됩니다.

| 테이블 | 역할 |
| --- | --- |
| `plans` | 요금제와 월별 사용 한도 |
| `users` | 사용자·관리자 계정과 구독 정보 |
| `payments` | 결제 상태 및 PG 거래 정보 |
| `api_keys` | 해시 처리된 API 키와 활성 상태 |
| `boards` | 공지사항과 Q&A 게시글 |
| `answers` | 관리자 답변 |
| `captcha_images` | 질문·선택지 이미지 메타데이터 |
| `captchas` | CAPTCHA 유형과 정답 정보 |
| `captcha_options` | 선택형 CAPTCHA의 보기 구성 |
| `captcha_verifications` | 정답, 드래그 궤적, 봇 판정 및 일회용 토큰 |

개발용 시드 데이터에는 Free·Basic·Pro 요금제, 테스트 사용자, 샘플 API 키, 두 종류의 CAPTCHA 예시가 포함됩니다. 시드 계정의 비밀번호 해시는 더미 값이므로 실제 로그인에는 사용할 수 없습니다.

## 개발 시 참고 사항

### Frontend 서비스 추가

현재 `frontend/Dockerfile.dev`는 `package.json`과 `npm run dev` 스크립트를 전제로 합니다. 프런트엔드 소스와 패키지 설정을 추가한 뒤 다음 명령으로 실행할 수 있습니다.

```bash
docker compose up --build frontend
```

### AI 서비스 추가

`docker-compose.yml`은 `AI/` 디렉터리에서 이미지를 빌드하고 5000번 포트를 노출하도록 정의되어 있습니다. AI API 서버와 Dockerfile을 추가한 뒤 전체 서비스를 실행하세요.

```bash
docker compose up --build
```

## 보안 체크리스트

- 비밀번호는 bcrypt 등 검증된 알고리즘으로 해시 처리
- API 키 원문은 저장하지 않고 SHA-256 해시만 보관
- 개발용 사용자, API 키, 시드 데이터를 운영 환경에서 제거
- `/db-check`를 운영 환경에서 제거하거나 관리자 인증 적용
- 환경별 비밀 값은 별도의 시크릿 관리 도구로 주입
- CAPTCHA 검증 토큰에 만료 시간과 일회성 사용 정책 적용

## 로드맵

- [ ] 회원가입·로그인 및 관리자 인증
- [ ] API 키 발급·폐기 API
- [ ] CAPTCHA 생성·검증 API
- [ ] 드래그 궤적 기반 봇 분류 모델 연동
- [ ] 이미지 식별형 CAPTCHA 모델 연동
- [ ] 요금제·결제 API 연동
- [ ] 사용자 및 관리자 프런트엔드 구현
- [ ] Nginx와 Kubernetes 배포 구성
- [ ] 자동화 테스트와 CI 파이프라인 구축

## 기여하기

1. 저장소를 Fork합니다.
2. 작업 브랜치를 생성합니다.
3. 변경 사항과 테스트를 함께 커밋합니다.
4. Pull Request에 변경 목적과 검증 방법을 작성합니다.

버그 제보나 기능 제안은 [GitHub Issues](https://github.com/kakao-NoBot/AI-Captcha/issues)를 이용해 주세요.

## 라이선스

현재 저장소에는 별도의 라이선스 파일이 없습니다. 코드의 사용·수정·배포가 필요한 경우 저장소 관리자에게 먼저 확인해 주세요.
