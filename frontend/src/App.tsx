import { lazy, Suspense, useEffect, useState } from 'react'
import TeamWorkspace from './pages/TeamWorkspace'
import { meetingDetailRoute, smartViews, workDetailRoute } from './components/smartwork-data'

const TeamChat = lazy(() => import('./pages/TeamChat'))

function readLocation() {
  return window.location.hash.slice(1) || (new URLSearchParams(window.location.search).has('invite') ? 'team' : 'portal')
}

export default function App() {
  const [section, setLocation] = useState(readLocation)

  useEffect(() => {
    function restoreLocation() {
      setLocation(readLocation())
    }
    window.addEventListener('popstate', restoreLocation)
    window.addEventListener('hashchange', restoreLocation)
    return () => {
      window.removeEventListener('popstate', restoreLocation)
      window.removeEventListener('hashchange', restoreLocation)
    }
  }, [])

  function navigate(next: string) {
    if (section !== next) {
      window.history.pushState(null, '', `#${next}`)
      setLocation(next)
    }
    window.scrollTo(0, 0)
  }

  if (section === 'chat') return <Suspense fallback={<p role="status">채팅을 불러오는 중…</p>}><TeamChat onBack={() => navigate('team')} /></Suspense>

  const smartView = section.startsWith('smart-') ? section.slice(6) : ''
  const workspaceRoute = smartViews.has(smartView) || workDetailRoute.test(section) || meetingDetailRoute.test(section) || section.startsWith('personal-') ||
    ['team', 'workspaces', 'team-calendar', 'team-reports', 'team-settings'].includes(section)
  return <TeamWorkspace view={workspaceRoute ? section : 'portal'} navigate={navigate} onOpenChat={() => navigate('chat')} />
}
