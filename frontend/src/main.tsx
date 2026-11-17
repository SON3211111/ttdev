// 프론트가 시작되는 파일입니다. index.html의 <div id="root"> 안에 App 화면을 그립니다.
// StrictMode는 개발 중 실수를 찾기 위한 검사입니다. effect를 추가 실행해도 요청 취소/정리가 잘 되는지 확인합니다.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
