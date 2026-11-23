import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Building2, X } from 'lucide-react'
import { CategoryBadge } from './SharedBadges'
import { type Task } from './smartwork-data'

type Client = { name: string; industry: string; owner: string; recent: string; status: '활성' | '종료'; tasks: Task[] }

function ClientDrawer({ client, close }: { client: Client; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className="sw-drawer" aria-labelledby="sw-client-title" onCancel={event => { event.preventDefault(); close() }}>
    <header><Building2 size={19} /><h2 id="sw-client-title">{client.name}</h2><button className="sw-icon-button" aria-label="업체 상세 닫기" type="button" onClick={close}><X size={20} /></button></header>
    <div className="sw-drawer-fields">
      <p>{client.industry} · 담당자 {client.owner}</p>
      <h3>업무 이력</h3>
      <ol className="sw-timeline">{client.tasks.map(task => <li key={task.id}><time>{task.start}</time><CategoryBadge category={task.category} /><p>{task.notes || '기록 없음'}</p></li>)}</ol>
    </div>
  </dialog>
}

export function ClientsView({ tasks, search }: { tasks: Task[]; search: string }) {
  const [industry, setIndustry] = useState('')
  const [find, setFind] = useState('')
  const [openClient, setOpenClient] = useState<string>()
  const clients = [...new Set(tasks.map(task => task.company))].map((name): Client => {
    const companyTasks = tasks.filter(task => task.company === name).sort((left, right) => right.start.localeCompare(left.start))
    return { name, industry: '미분류', owner: companyTasks[0]?.assigneeName ?? '—', recent: companyTasks.find(task => task.category === 'meeting')?.start ?? '—',
      status: companyTasks.some(task => task.status !== '완료') ? '활성' : '종료', tasks: companyTasks }
  })
  const selected = clients.find(client => client.name === openClient)
  const shown = clients.filter(client => (!industry || client.industry === industry)
    && [search, find].every(term => client.name.toLowerCase().includes(term.trim().toLowerCase())))
  return <>
    <h1 className="sw-page-title">업체 관리</h1>
    <div className="sw-kpis sw-crm-kpis">{[['전체 등록 업체', clients.length], ['활성 거래처', clients.filter(client => client.status === '활성').length], ['종료된 거래처', clients.filter(client => client.status === '종료').length]].map(([label, count]) =>
      <section className="sw-card sw-stat" key={label}><p>{label}</p><strong>{count}<small>곳</small></strong></section>)}</div>
    <section className="sw-card sw-module">
      <div className="sw-filter">
        <label>업체 검색<input value={find} onChange={event => setFind(event.target.value)} placeholder="업체명을 입력하세요…" /></label>
        <label>산업군<select value={industry} onChange={event => setIndustry(event.target.value)}><option value="">전체</option>{[...new Set(clients.map(client => client.industry))].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="sw-table-scroll" role="region" aria-label="업체 목록" tabIndex={0}><table className="sw-table">
        <thead><tr><th>업체명</th><th>담당자</th><th>최근 미팅일</th><th>진행 업무</th><th>상세</th></tr></thead>
        <tbody>{shown.map(client => <tr key={client.name}><td><strong>{client.name}</strong><small>{client.industry}</small></td><td>{client.owner}</td>
          <td>{client.recent}</td><td><div className="sw-buttons">{[...new Set(client.tasks.filter(task => task.status !== '완료').map(task => task.category))].map(category => <CategoryBadge key={category} category={category} />)}</div></td>
          <td><button type="button" className="sw-icon-button" aria-label={client.name + ' 상세'} onClick={() => setOpenClient(client.name)}><ArrowUpRight size={17} /></button></td></tr>)}</tbody>
      </table></div>
      {!shown.length && <p className="sw-empty">검색 조건에 맞는 업체가 없습니다.</p>}
    </section>
    {selected && <ClientDrawer client={selected} close={() => setOpenClient(undefined)} />}
  </>
}
