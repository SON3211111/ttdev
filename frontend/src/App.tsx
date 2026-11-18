// 어떤 화면을 보여줄지 고르는 파일입니다. page가 home이면 홈, ai-test면 AI 테스트를 보여줍니다.
// onOpenAiTest는 HomePage에 전달하는 함수입니다. 홈의 버튼이 이 함수를 부르면 page가 바뀝니다.
import { useState } from 'react'
import AiTestPage from './pages/AiTestPage'
import HomePage from './pages/HomePage'
import TasksPage from './pages/TasksPage'
import './App.css'

export default function App() {
  const [page, setPage] = useState<'home' | 'records' | 'ai-test' | 'tasks'>('home')
  const [taskHomeRevision, setTaskHomeRevision] = useState(0)
  const [selectedTask, setSelectedTask] = useState<{ id: string; source: 'calendar' | 'schedules' } | null>(null)

  function navigate(next: typeof page) {
    setPage(next)
    window.scrollTo(0, 0)
  }

  function navigateHome(section: string) {
    navigate(section === 'records' ? 'records' : 'home')
    if (section === 'records' || section === 'home') return
    requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView()
      if (section === 'memory') document.getElementById('memory-question')?.focus({ preventScroll: true })
    })
  }

  if (page === 'ai-test') {
    return (
      <>
        <button className="back" onClick={() => setPage('home')}>← 홈으로 돌아가기</button>
        <AiTestPage />
      </>
    )
  }

  const tasksOpen = page === 'tasks'
  return <>
    <div hidden={tasksOpen}>
      <HomePage recordsOpen={page === 'records'} onHomeSection={navigateHome}
        onOpenAiTest={() => setPage('ai-test')} taskHomeRevision={taskHomeRevision}
        onOpenTasks={() => {
          setSelectedTask(null)
          navigate('tasks')
        }}
        onOpenTask={(id, source) => {
          setSelectedTask({ id, source })
          navigate('tasks')
        }} />
    </div>
    {tasksOpen && <TasksPage selectedTask={selectedTask} onHome={section => {
      setTaskHomeRevision(value => value + 1)
      navigateHome(section)
    }} />}
  </>
}
