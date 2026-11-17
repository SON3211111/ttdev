// 어떤 화면을 보여줄지 고르는 파일입니다. page가 home이면 홈, ai-test면 AI 테스트를 보여줍니다.
// onOpenAiTest는 HomePage에 전달하는 함수입니다. 홈의 버튼이 이 함수를 부르면 page가 바뀝니다.
import { useState } from 'react'
import AiTestPage from './pages/AiTestPage'
import HomePage from './pages/HomePage'
import './App.css'

export default function App() {
  const [page, setPage] = useState<'home' | 'ai-test'>('home')

  if (page === 'ai-test') {
    return (
      <>
        <button className="back" onClick={() => setPage('home')}>← 홈으로 돌아가기</button>
        <AiTestPage />
      </>
    )
  }

  return <HomePage onOpenAiTest={() => setPage('ai-test')} />
}
