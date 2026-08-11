FROM python:3.12.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # 모델 캐시를 이미지 안 고정 경로에 둔다 — 런타임에 HF_HOME이 달라져도 구워둔 걸 쓴다.
    HF_HOME=/opt/hf \
    EMBED_MODEL=intfloat/multilingual-e5-small

WORKDIR /app

# GPU는 vLLM이 점유하므로 이 서비스는 CPU 전용 torch만 설치한다(이미지 크기도 크게 줄어든다).
COPY requirements.txt /tmp/embed-requirements.txt
RUN pip install --upgrade pip \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r /tmp/embed-requirements.txt

# 모델 가중치를 빌드 시점에 내려받아 이미지에 굽는다. 이렇게 하면 파드가 뜰 때
# HuggingFace에 접속할 필요가 없어 기동이 빠르고 외부 장애에 영향받지 않는다.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBED_MODEL}', device='cpu')"

COPY main.py ./

EXPOSE 8100
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
    CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=2)"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
