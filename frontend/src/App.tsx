import { useEffect, useState } from 'react'
import AiTestPage from './pages/AiTestPage'
import HomePage from './pages/HomePage'
import TasksPage from './pages/TasksPage'
import './App.css'

type SelectedTask = { id: string; source: 'calendar' | 'schedules' }

function readLocation() {
  const section = window.location.hash.slice(1) || 'home'
  const selectedTask = section === 'tasks' ? window.history.state?.selectedTask as SelectedTask | undefined : undefined
  return { section, selectedTask: selectedTask ?? null }
}

export default function App() {
  const [{ section, selectedTask }, setLocation] = useState(readLocation)
  const [taskHomeRevision, setTaskHomeRevision] = useState(0)

  useEffect(() => {
    function restoreLocation() {
      setLocation(readLocation())
      setTaskHomeRevision(value => value + 1)
    }
    window.addEventListener('popstate', restoreLocation)
    return () => window.removeEventListener('popstate', restoreLocation)
  }, [])

  function navigate(next: string, task: SelectedTask | null = null) {
    if (section !== next || selectedTask?.id !== task?.id || selectedTask?.source !== task?.source) {
      window.history.pushState({ selectedTask: task }, '', `#${next}`)
      setLocation({ section: next, selectedTask: task })
    }
    window.scrollTo(0, 0)
    if (next !== 'calendar' && next !== 'schedules' && next !== 'memory') return
    requestAnimationFrame(() => {
      document.getElementById(next)?.scrollIntoView()
      if (next === 'memory') document.getElementById('memory-question')?.focus({ preventScroll: true })
    })
  }

  if (section === 'ai-test') {
    return (
      <>
        <button className="back" onClick={() => navigate('home')}>← 홈으로 돌아가기</button>
        <AiTestPage />
      </>
    )
  }

  const tasksOpen = section === 'tasks'
  return <>
    <div hidden={tasksOpen}>
      <HomePage recordsOpen={section === 'records'} onHomeSection={navigate}
        onOpenAiTest={() => navigate('ai-test')} taskHomeRevision={taskHomeRevision}
        onOpenTasks={() => navigate('tasks')}
        onOpenTask={(id, source) => navigate('tasks', { id, source })} />
    </div>
    {tasksOpen && <TasksPage key={selectedTask?.id ?? 'list'} selectedTask={selectedTask} onHome={section => {
      setTaskHomeRevision(value => value + 1)
      navigate(section)
    }} />}
  </>
}
