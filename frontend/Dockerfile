# Node/npm을 설치하고 프론트 개발 서버를 실행할 이미지를 만듭니다.
# npm ci는 잠금 파일의 버전대로 라이브러리를 설치합니다. 실행 시 compose가 로컬 frontend 폴더를 연결합니다.
# 현재는 개발용 Vite 서버이며, 공개 배포용 웹 서버를 만드는 설정은 아닙니다.

FROM alpine:3.22

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
