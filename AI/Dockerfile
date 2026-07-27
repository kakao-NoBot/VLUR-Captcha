# 아직 AI 서비스 자체는 구현되지 않았다(스켈레톤). backend가 봇 판별 모델을 직접
# 서빙하고 있어 지금은 이 서비스가 필요 없지만, docker-compose.yml에 정의는 있어서
# `docker compose up --build`(서비스 지정 없이)가 여기서 항상 깨졌다 — 최소한의
# 더미로 빌드/기동만 되게 해서 팀원 onboarding이 이 서비스 때문에 막히지 않게 한다.
FROM python:3.12.13-slim
CMD ["python3", "-c", "import time; print('AI 서비스는 아직 구현되지 않았습니다.'); time.sleep(1e9)"]
