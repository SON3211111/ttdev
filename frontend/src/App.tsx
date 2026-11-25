import { useEffect, useState } from 'react'
import TeamWorkspace from './pages/TeamWorkspace'
import { reportDetailRoute, smartViews, workDetailRoute } from './components/smartwork-data'

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

  const smartView = section.startsWith('smart-') ? section.slice(6) : ''
  const workspaceRoute = smartViews.has(smartView) || workDetailRoute.test(section) || reportDetailRoute.test(section) || section.startsWith('personal-') ||
    ['team', 'workspaces', 'team-calendar', 'team-reports', 'team-settings', 'assistant', 'chat'].includes(section)
  return <TeamWorkspace view={workspaceRoute ? section : 'portal'} navigate={navigate} onOpenChat={() => navigate('chat')} />
}
