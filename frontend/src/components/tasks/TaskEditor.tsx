import { useId, useState } from 'react'
import type { Task, TaskInput } from '../../api/tasks'

type Props = {
  task: Task | null
  busy: boolean
  error: string
  onSave: (input: TaskInput) => void
  onClose: () => void
}

export default function TaskEditor({ task, busy, error, onSave, onClose }: Props) {
  const heading = useId()
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  return <section className="task-panel" aria-labelledby={heading}>
    <h2 id={heading}>{task ? '일정 수정' : '할 일 추가'}</h2>
    <form className="task-form" onSubmit={event => {
      event.preventDefault()
      onSave({ title, description: description || null, dueDate: dueDate || null })
    }}>
      <fieldset disabled={busy}>
        <label>일정 이름<input autoFocus required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>설명 (선택)<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <label>마감일 (선택)<input type="date" min="1000-01-01" max="9999-12-31" value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="task-actions">
          <button type="submit" disabled={!title.trim()}>{busy ? '저장 중…' : '일정 저장'}</button>
          <button type="button" onClick={onClose}>닫기</button>
        </div>
      </fieldset>
    </form>
  </section>
}
