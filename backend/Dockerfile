# ── 위젯 빌드 스테이지 ──────────────────────────────────────────────
# frontend/src/widget/main.jsx를 vlur-captcha.js로 빌드해서 백엔드 이미지에 그대로 굽는다.
# 이 Dockerfile은 빌드 컨텍스트가 저장소 최상위(.)라는 전제로 작성됐다 — backend/뿐 아니라
# frontend/도 컨텍스트 안에 있어야 위젯을 빌드할 수 있기 때문이다.
# GitHub Actions에서: context: . / file: ./backend/Dockerfile 로 빌드할 것.
FROM node:24-alpine AS widget-builder
WORKDIR /widget
# 위젯이 호출할 vlur.site 백엔드 오리진 — CI에서 build-args로 주입, 안 주면 로컬 기본값.
ARG VITE_VLUR_API_BASE=http://localhost:8000
ENV VITE_VLUR_API_BASE=$VITE_VLUR_API_BASE
COPY frontend/package*.json ./
RUN npm install
COPY frontend/. .
RUN npm run build:widget

# ── 백엔드 런타임 ──────────────────────────────────────────────────
FROM python:3.12.13-slim
WORKDIR /app

# 의존성 설치
# 이 이미지의 backend는 모델을 직접 서빙하지 않고 별도 ai 컨테이너를 HTTP로 호출하는
# 구조라(services/drag_classifier.py) torch/ml 의존성이 없다 — requirements.txt만 설치.
COPY backend/requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# 백엔드 소스 복사
COPY backend/. .

# 위젯 빌드 스테이지 산출물을 static/widget에 얹는다 — 위의 COPY보다 반드시 뒤에 와야
# backend/static/widget/에 남아있을 수 있는 로컬 임시 파일을 새로 빌드한 걸로 덮어쓴다.
COPY --from=widget-builder /widget/dist-widget/vlur-captcha.js ./static/widget/vlur-captcha.js

# FastAPI 실행
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
