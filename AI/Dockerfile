FROM python:3.12.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt /tmp/ai-requirements.txt
RUN pip install --upgrade pip \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r /tmp/ai-requirements.txt

# AI를 Python 패키지로 유지해 로컬 실행과 컨테이너 실행의 import 경로를 통일한다.
COPY . ./AI

EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD ["python3", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=2)"]

CMD ["uvicorn", "AI.main:app", "--host", "0.0.0.0", "--port", "5000"]
