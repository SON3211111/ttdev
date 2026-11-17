# Python 라이브러리와 코드를 이미지에 복사하고 uvicorn으로 FastAPI 서버를 실행합니다.
# COPY는 이미지 생성 시점의 복사입니다. ai/main.py를 고쳤다면 AI 이미지를 다시 빌드해야 반영됩니다.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
