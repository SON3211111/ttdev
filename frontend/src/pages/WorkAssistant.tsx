import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, FileText, LoaderCircle, Send, Sparkles, X } from 'lucide-react'
import { apiRequest } from '../api/request'
import './WorkAssistant.css'

const approvalLabels = { APPROVED: '승인 완료', PENDING: '결재 대기', DRAFT: '초안' }
const examples = ['삼성전자 납품 일정은 언제로 정했어?', '부서별 인원 알려줘', '이번 주 마감 업무 알려줘']
type Source = { route: string; title: string; context: string; date: string; excerpt: string; approvalStatus?: keyof typeof approvalLabels | null }
type WorkContext = { name: string | null; team: string | null; keyword?: string | null; period: string | null; status: string; dateField: string }
type Evidence = { title: string; message: string | null; quotes: (Pick<Source, 'route' | 'title' | 'approvalStatus'> & { text: string })[] }
const answerTitles = { history: '변경 경위', assignment: '업무 조회', meeting: '회의 조회', weeklyReport: '주간 업무보고', approval: '결재 조회', org: '조직 조회', stats: '업무 집계', help: '안내' }
type Answer = { answer: string | null; sources: Source[]; unavailable: boolean; kind?: keyof typeof answerTitles; criteria?: string[]; context?: WorkContext; evidence?: Evidence[] }

export function AssistantLauncher() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  return <>
    <button className="sw-assistant-launcher" type="button" aria-label="AI 비서 열기"
      aria-haspopup="dialog" aria-controls="assistant-dialog" aria-expanded={open}
      onClick={() => { dialog.current?.showModal(); setOpen(true) }}>
      <Bot size={26} aria-hidden="true" />
    </button>
    <dialog id="assistant-dialog" className="sw-assistant-dialog" ref={dialog}
      aria-labelledby="assistant-title" onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <WorkAssistant onClose={() => dialog.current?.close()} />
    </dialog>
  </>
}

export default function WorkAssistant({ onClose }: { onClose?: () => void }) {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [result, setResult] = useState<Answer>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [context, setContext] = useState<WorkContext>()
  const references = useRef<string[]>([])
  const active = useRef<AbortController>(null)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => () => active.current?.abort(), [])

  async function submit(text: string) {
    if (!text.trim() || active.current) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setAsked(text.trim())
    setResult(undefined)
    setError('')
    log.current?.scrollTo({ top: 0 })
    try {
      const answer = await apiRequest<Answer>('/api/team/assistant', {
        method: 'POST', body: JSON.stringify({ question: text, context, references: references.current }), signal: controller.signal,
      }, 45000)
      setResult(answer)
      // 되묻는 답이나 원문 없는 답 뒤에도 이어지는 질문("그중", "그거")이 앞 조건·원문을 쓰도록 유지한다.
      setContext(answer.context ?? context)
      if (answer.sources.length) references.current = answer.sources.slice(0, 5).map(source => source.route)
      setQuestion('')
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '질문을 처리하지 못했습니다.')
    } finally {
      active.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit(question)
  }

  // Enter는 질문, Shift+Enter는 줄바꿈. 한글 조합 중인 Enter는 무시한다.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit(question)
    }
  }

  const Container = onClose ? 'div' : 'main'
  function closeForLink(event: MouseEvent<HTMLAnchorElement>) {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onClose?.()
  }
  const answerTitle = result?.kind ? answerTitles[result.kind] : '답변'

  return <Container className="sw-system sw-assistant">
    {!onClose && <a className="sw-secondary sw-assistant-home" href="#portal"><ArrowLeft size={16} /> 홈</a>}
    <section className="sw-assistant-shell" aria-labelledby="assistant-title">
      <header className="sw-assistant-header">
        <span className="sw-assistant-mark" aria-hidden="true"><Bot size={20} /></span>
        <div>
          <h1 id="assistant-title">AI 비서</h1>
          <p>업무·회의 기록에서 찾아 원문과 함께 답합니다</p>
        </div>
        {onClose && <button type="button" className="sw-icon-button" onClick={onClose} aria-label="AI 비서 닫기"><X size={20} /></button>}
      </header>

      <div className="sw-assistant-log" ref={log}>
        {!asked && <div className="sw-assistant-intro">
          <p>업무 일정, 담당자, 회의 결정 사항, 부서 인원 등을 물어보세요.</p>
          <ul aria-label="질문 예시">{examples.map(example => <li key={example}>
            <button type="button" onClick={() => void submit(example)} disabled={pending}>{example}</button>
          </li>)}</ul>
        </div>}

        {asked && <p className="sw-assistant-question"><span>질문</span>{asked}</p>}
        {pending && <p className="sw-assistant-pending" role="status">
          <LoaderCircle size={18} aria-hidden="true" /> 관련 기록을 찾아 답변을 작성하는 중입니다.</p>}
        {error && <p className="sw-error" role="alert">{error}</p>}

        {result && <>
          {result.unavailable && <p className="sw-assistant-notice" role="status">
            <AlertTriangle size={18} aria-hidden="true" /> 지금은 AI 답변을 만들 수 없습니다. 아래 관련 원문에서 확인해 주세요.</p>}

          {result.answer && <article className="sw-assistant-answer" aria-labelledby="assistant-answer">
            <h2 id="assistant-answer"><Sparkles size={16} aria-hidden="true" /> {answerTitle}</h2>
            <p className="sw-assistant-text sw-assistant-answer-text">{result.answer}</p>
            {!!result.criteria?.length && <ul className="sw-assistant-criteria" aria-label="조회 기준">
              {result.criteria.map(item => <li key={item}>{item}</li>)}</ul>}
            {result.evidence && <div className="sw-assistant-evidence">{result.evidence.map(group => <section key={group.title}>
              <h3>{group.title}</h3>
              {group.message && <p className="sw-assistant-muted">{group.message}</p>}
              {group.quotes.length > 0 && <ul>{group.quotes.map(quote => <li key={quote.route + ':' + quote.text}>
                <blockquote className="sw-assistant-text">{quote.text}</blockquote>
                <a href={'#' + quote.route} onClick={closeForLink}>{quote.title}
                  {quote.approvalStatus && ` · ${approvalLabels[quote.approvalStatus]}`} <ArrowRight size={14} aria-hidden="true" /></a>
              </li>)}</ul>}
            </section>)}</div>}
          </article>}

          {result.sources.length > 0 ? <section className="sw-assistant-sources" aria-labelledby="assistant-sources">
            <h2 id="assistant-sources">관련 원문 <span>{result.sources.length}</span></h2>
            <ul>{result.sources.map(source => <li key={source.route}>
              <a href={'#' + source.route} onClick={closeForLink}>
                <FileText size={16} aria-hidden="true" />
                <span className="sw-assistant-source-title">{source.title}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </a>
              <small>{source.context}{source.date && ` · ${source.date}`}
                {source.approvalStatus && <b className={'sw-assistant-status-' + source.approvalStatus.toLowerCase()}>{approvalLabels[source.approvalStatus]}</b>}</small>
              {source.excerpt && <p className="sw-assistant-excerpt">{source.excerpt}</p>}
            </li>)}</ul>
          </section> : !result.answer && <p className="sw-assistant-notice" role="status">
            관련 업무나 회의를 찾지 못했습니다. 예: “이번 주 내 업무”, “우리 팀 오늘 마감인 업무”, “어제 일일회의 내용”처럼 기간·팀·업체명을 넣어 물어보세요.</p>}
        </>}
      </div>

      <form className="sw-assistant-composer" onSubmit={ask}>
        <label htmlFor="assistant-question" className="sw-assistant-sr">업무나 회의에 대해 물어보세요</label>
        <textarea id="assistant-question" rows={2} maxLength={500} value={question} disabled={pending}
          placeholder="업무나 회의에 대해 물어보세요" title="Enter 전송 · Shift+Enter 줄바꿈"
          onChange={event => setQuestion(event.target.value)} onKeyDown={onKeyDown} />
        <button className="sw-primary" disabled={pending || !question.trim()}><Send size={16} aria-hidden="true" /> 질문하기</button>
      </form>
    </section>
  </Container>
}
