import { lazy, Suspense, useEffect, useState } from 'react'
import AiTestPage from './pages/AiTestPage'
import HomePage from './pages/HomePage'
import TasksPage from './pages/TasksPage'
import TeamLanding from './pages/TeamLanding'
import TeamWorkspace from './pages/TeamWorkspace'
import LegacyGate from './components/LegacyGate'
import { smartViews } from './components/smartwork-data'
import './App.css'

const TeamChat = lazy(() => import('./pages/TeamChat'))

type SelectedTask = { id: string; source: 'calendar' | 'schedules' }

// URL 해시로 화면을 복원하고, 방문 기록에 저장한 할 일 ID와 진입 위치로 상세 화면을 복원합니다.
function readLocation() {
  const section = window.location.hash.slice(1) || (new URLSearchParams(window.location.search).has('invite') ? 'team' : 'portal')
  const selectedTask = section === 'tasks' ? window.history.state?.selectedTask as SelectedTask | undefined : undefined
  return { section, selectedTask: selectedTask ?? null }
}

export default function App() {
  const [{ section, selectedTask }, setLocation] = useState(readLocation)
  const [taskHomeRevision, setTaskHomeRevision] = useState(0)

  // 뒤로가기나 앞으로가기 때 위치를 복원하면서 홈에 표시되는 할 일도 다시 조회합니다.
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

  if (section === 'landing') return <TeamLanding />
  const smartView = section === 'portal' ? 'portal' : section.startsWith('smart-') ? section.slice(6) : ''
  if (smartViews.has(smartView) || section.startsWith('personal-') || ['team', 'workspaces', 'team-calendar', 'team-reports', 'team-settings'].includes(section)) {
    return <TeamWorkspace view={section} navigate={navigate} onOpenChat={() => navigate('chat')} />
  }
  if (section === 'chat') return <Suspense fallback={<p role="status">채팅을 불러오는 중…</p>}><TeamChat onBack={() => navigate('team')} /></Suspense>

  if (section === 'ai-test') {
    return (
      <LegacyGate signIn={() => navigate('workspaces')}>
        <button className="back" onClick={() => navigate('home')}>← 홈으로 돌아가기</button>
        <AiTestPage />
      </LegacyGate>
    )
  }

  const tasksOpen = section === 'tasks'
  return <LegacyGate signIn={() => navigate('workspaces')}>
    {/* 일정 관리에서 홈을 숨겨도 컴포넌트는 유지되므로 달력 선택 날짜와 입력 상태가 남습니다. */}
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
  </LegacyGate>
}
