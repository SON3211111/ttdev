// 질문을 입력해 React → Java 백엔드 → Python AI 서버 → Ollama 연결을 확인하는 화면입니다.
// 모델이 만든 일반 답변을 보여주며, 저장한 메모 검색이나 질문/답변의 DB 저장은 하지 않습니다.

import { useState } from 'react'

type AiResponse = {
  model: string
  response: string
}

function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 전송할 때 지난 답변/오류를 지우고 loading을 켭니다. loading이 켜져 있으면 버튼을 잠급니다.
  // try에서 응답을 읽고, catch에서 안내를 표시하며, finally에서 성공/실패와 관계없이 loading을 끕니다.
  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return

    setLoading(true)
    setAnswer('')
    setModel('')
    setError('')

    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
        }),
      })

      if (!response.ok) {
        let message = 'AI 요청 중 오류가 발생했습니다.'

        try {
          const errorData = await response.json()

          if (typeof errorData.error === 'string') {
            message = errorData.error
          }
        } catch {
          // 서버가 JSON 대신 다른 형식을 보내도 이곳에서 추가 오류를 내지 않고 기본 안내를 사용합니다.
        }

        if (response.status === 400) {
          message = '질문을 올바르게 입력해주세요.'
        } else if (response.status === 502) {
          message = 'AI 서버 요청 처리에 실패했습니다.'
        } else if (response.status === 503) {
          message = 'AI 서버에 연결할 수 없습니다.'
        } else if (response.status === 504) {
          message = 'AI 응답 시간이 초과되었습니다.'
        }

        throw new Error(message)
      }

      const data: AiResponse = await response.json()

      setAnswer(data.response)
      setModel(data.model)

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '알 수 없는 오류가 발생했습니다.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: '700px',
        margin: '60px auto',
        padding: '24px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1>AI 테스트</h1>

      <p>
        React → Spring Boot → FastAPI → Ollama
      </p>

      <div style={{ marginTop: '30px' }}>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="AI에게 질문을 입력하세요..."
          rows={5}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #ccc',
          }}
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          style={{
            marginTop: '12px',
            padding: '12px 24px',
            fontSize: '16px',
            cursor: loading ? 'wait' : 'pointer',
            borderRadius: '8px',
          }}
        >
          {loading ? '답변 생성 중...' : '질문 전송'}
        </button>
      </div>

      {loading && (
        <p style={{ marginTop: '20px' }}>
          AI가 답변을 생성하고 있습니다...
        </p>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: '20px',
            padding: '14px',
            color: '#b91c1c',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
          }}
        >
          {error}
        </div>
      )}

      {answer && (
        <section
          style={{
            marginTop: '30px',
            padding: '20px',
            border: '1px solid #ccc',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
          }}
        >
          <h2>AI Response</h2>

          <p>{answer}</p>

          <p
            style={{
              marginTop: '20px',
              fontSize: '13px',
              color: '#888',
            }}
          >
            Model: {model}
          </p>
        </section>
      )}
    </main>
  )
}

export default App
