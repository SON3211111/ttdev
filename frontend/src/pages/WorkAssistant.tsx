import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Bot, X } from 'lucide-react'
import { apiRequest } from '../api/request'
import './WorkAssistant.css'

const approvalLabels = { APPROVED: '승인 완료', PENDING: '결재 대기', DRAFT: '초안' }
type Source = { route: string; title: string; context: string; date: string; excerpt: string; approvalStatus?: keyof typeof approvalLabels | null }
type WorkContext = { name: string | null; team: string | null; period: string | null; status: string; dateField: string }
type Answer = { answer: string | null; sources: Source[]; unavailable: boolean; kind?: 'assignment'; criteria?: string[]; context?: WorkContext }

export function AssistantLauncher() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  return <>
    <button className="sw-assistant-launcher" type="button" aria-label="AI 비서 열기"
      aria-haspopup="dialog" aria-controls="assistant-dialog" aria-expanded={open}
      onClick={() => { dialog.current?.showModal(); setOpen(true) }}>
      <Bot size={28} aria-hidden="true" />
    </button>
    <dialog id="assistant-dialog" className="sw-assistant-dialog" ref={dialog}
      aria-labelledby="assistant-title" onClose={() => setOpen(false)}>
      <WorkAssistant onClose={() => dialog.current?.close()} />
    </dialog>
  </>
}

export default function WorkAssistant({ onClose }: { onClose?: () => void }) {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<Answer>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [context, setContext] = useState<WorkContext>()
  const references = useRef<string[]>([])
  const active = useRef<AbortController>(null)

  useEffect(() => () => active.current?.abort(), [])

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim() || active.current) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setResult(undefined)
    setError('')
    try {
      const answer = await apiRequest<Answer>('/api/team/assistant', {
        method: 'POST', body: JSON.stringify({ question, context, references: references.current }), signal: controller.signal,
      }, 45000)
      setResult(answer)
      setContext(answer.context)
      references.current = answer.sources.slice(0, 5).map(source => source.route)
      setQuestion('')
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '질문을 처리하지 못했습니다.')
    } finally {
      active.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  const Container = onClose ? 'div' : 'main'
  return <Container className="sw-system sw-assistant">
    {!onClose && <a className="sw-secondary" href="#portal"><ArrowLeft size={16} /> 홈</a>}
    <section className="sw-card sw-assistant-panel" aria-labelledby="assistant-title">
      <header className="sw-assistant-header">
        <h1 id="assistant-title"><Bot size={24} aria-hidden="true" /> AI 비서</h1>
        {onClose && <button type="button" className="sw-icon-button" onClick={onClose} aria-label="AI 비서 닫기"><X size={20} /></button>}
      </header>
      <form onSubmit={ask}>
        <label htmlFor="assistant-question">업무나 회의에 대해 물어보세요</label>
        <textarea id="assistant-question" rows={3} maxLength={500} value={question} disabled={pending}
          placeholder="예: 삼성전자 납품 일정은 언제로 정했어?" onChange={event => setQuestion(event.target.value)} />
        <button className="sw-primary" disabled={pending || !question.trim()}>질문하기 <ArrowRight size={16} /></button>
      </form>
      {pending && <p role="status">관련 기록을 찾아 답변을 작성하는 중입니다.</p>}
      {error && <p className="sw-error" role="alert">{error}</p>}
    </section>
    {result && <>
      {result.answer && <section className="sw-card sw-assistant-panel" aria-labelledby="assistant-answer">
        <h2 id="assistant-answer">{result.kind === 'assignment' ? '업무 조회' : 'AI 답변'}</h2>
        {!!result.criteria?.length && <p><small>{result.criteria.join(' · ')}</small></p>}
        <p className="sw-assistant-text">{result.answer}</p>
      </section>}
      {result.sources.length > 0 ? <section className="sw-card sw-assistant-panel" aria-labelledby="assistant-sources">
        <h2 id="assistant-sources">관련 원문</h2>
        {result.unavailable && <p role="status">지금은 AI 답변을 만들 수 없습니다. 아래 원문에서 확인할 수 있습니다.</p>}
        <ul>{result.sources.map(source => <li key={source.route}>
          <a href={'#' + source.route} onClick={event => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onClose?.()
          }}>{source.title} <ArrowRight size={15} aria-hidden="true" /></a>
          <small>{source.context}{source.approvalStatus && ` · ${approvalLabels[source.approvalStatus]}`}</small>
          <p className="sw-assistant-text">{source.excerpt}</p>
        </li>)}</ul>
      </section> : !result.answer && <p className="sw-card sw-assistant-panel" role="status">관련 업무나 회의를 찾지 못했습니다. 업체명이나 업무 제목으로 다시 검색해 보세요.</p>}
    </>}
  </Container>
}
