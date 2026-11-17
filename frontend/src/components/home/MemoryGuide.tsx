// 앞으로 만들 AI 기억 검색의 입력창 미리보기입니다. 현재는 실제 검색 요청을 보내지 않습니다.
// question은 입력한 질문, notice는 버튼을 누른 뒤 보여줄 안내입니다. 둘 다 이 화면 안에서만 기억합니다.
import './MemoryGuide.css'
import { useState } from 'react'

export default function MemoryGuide() {
  const [question, setQuestion] = useState('')
  const [notice, setNotice] = useState('')

  return (
    <aside className="memory" aria-labelledby="memory-title">
      <span className="spark" aria-hidden="true">✧</span>
      <p className="eyebrow">FIND YOUR MEMORIES</p>
      <h2 id="memory-title">기억이 필요한 순간,<br />물어보세요.</h2>
      <p>일기와 메모에서 관련 기억을 찾고<br />답변의 원문을 함께 확인하는 공간이에요.</p>
      <form className="memory-search" onSubmit={event => {
        event.preventDefault()
        if (question.trim()) setNotice('검색 화면 미리보기입니다. 실제 기록 검색과 원문 출처는 AI 기능 구현 후 연결됩니다.')
      }}>
        <label htmlFor="memory-question">어떤 기억을 찾고 싶나요?</label>
        <input id="memory-question" value={question} onChange={event => {
          setQuestion(event.target.value)
          setNotice('')
        }} placeholder="민수랑 갔던 카페가 어디였지?" />
        <button className="memory-button" disabled={!question.trim()}>기억 찾기 미리보기 ↗</button>
      </form>
      <p className="search-notice" role="status">{notice}</p>
      <span className="coming">AI 검색 연결 예정 · 현재는 검색되지 않아요</span>
    </aside>
  )
}
