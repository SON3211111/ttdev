// Vite는 프론트 개발 서버입니다. 이 파일은 Docker 안에서 실행할 서버 주소/파일 감지/API 전달 방식을 정합니다.
// 프록시는 요청을 대신 전달하는 기능입니다. 브라우저의 /api 요청을 아래 backend:8080으로 보냅니다.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    watch: {
      // Docker에 연결한 Windows 파일은 변경 알림이 누락될 수 있어 1초마다 바뀌었는지 직접 확인합니다(폴링).
      usePolling: true,
      interval: 1000,
    },

    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://backend:8080',
        changeOrigin: true,
      },
    },
  },
})
