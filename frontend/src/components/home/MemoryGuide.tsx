// 기록·약속·할 일에 질문하는 화면의 미리보기입니다.
// question은 입력한 질문, notice는 버튼을 누른 뒤 보여줄 안내입니다. 둘 다 이 화면 안에서만 기억합니다.
import './MemoryGuide.css'
import { useState } from 'react'

export default function MemoryGuide() {
  const [question, setQuestion] = useState('')
  const [notice, setNotice] = useState('')

  return (
    <aside id="memory" className="memory" aria-labelledby="memory-title">
      <h2 id="memory-title">메모리아에 물어보기</h2>
      <form className="memory-search" onSubmit={event => {
        event.preventDefault()
        if (question.trim()) setNotice('미리보기예요. 데이터 조회와 출처가 있는 답변은 연결 예정이에요.')
      }}>
        <label htmlFor="memory-question">기록, 약속, 할 일에 대해 물어보세요.</label>
        <input id="memory-question" value={question} onChange={event => {
          setQuestion(event.target.value)
          setNotice('')
        }} placeholder="이번 주에 마감하는 할 일은 뭐야?" />
        <button className="memory-button" disabled={!question.trim()}>미리보기</button>
      </form>
      <p className="search-notice" role="status">{notice}</p>
      <span className="coming">AI 답변 연결 예정</span>
    </aside>
  )
}
