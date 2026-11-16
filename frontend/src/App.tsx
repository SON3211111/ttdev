
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
        throw new Error(
          `API request failed: ${response.status}`
        )
      }

      const data: AiResponse = await response.json()

      setAnswer(data.response)
      setModel(data.model)

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred.'
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
      <h1>AI Integration Test</h1>

      <p>
        React → Spring Boot → FastAPI → Ollama
      </p>

      <div style={{ marginTop: '30px' }}>
        <h2>Ask AI</h2>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your question here..."
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
          {loading ? 'Generating...' : 'Send Question'}
        </button>
      </div>

      {loading && (
        <p style={{ marginTop: '20px' }}>
          AI is generating a response...
        </p>
      )}

      {error && (
        <p
          style={{
            color: 'red',
            marginTop: '20px',
          }}
        >
          {error}
        </p>
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
