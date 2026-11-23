import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Bold, Bookmark, ChevronDown, ChevronRight, Command, FileText, Hash, Italic, Link2, Menu, MessageSquare, MoreHorizontal, Search, Send, Smile, X } from 'lucide-react'
import { channels, directMessages, initialMessages, people, type Message, type Person } from './chat-data'
import './TeamChat.css'

const emojis = ['👍', '🙌', '🚀', '✨', '👀', '❤️']
const timeNow = () => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())

function Avatar({ person, status = false }: { person: Person; status?: boolean }) {
  const profile = people[person]
  return <span className={`chat-avatar avatar-${profile.color}`} aria-label={profile.name + (status ? profile.online ? ', online' : ', offline' : '')} role="img">
    {profile.initials}{status && profile.online && <i className="chat-online" aria-hidden="true" />}
  </span>
}

function richText(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|_[^_\n]+_|https?:\/\/[^\s<]+)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith('_') && part.endsWith('_')) return <em key={index}>{part.slice(1, -1)}</em>
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>
    return part
  })
}

function Composer({ label, draft, setDraft, send }: { label: string; draft: string; setDraft: (text: string) => void; send: () => void }) {
  const input = useRef<HTMLTextAreaElement>(null)

  function format(open: string, close = open) {
    const field = input.current
    if (!field) return
    const { selectionStart: start, selectionEnd: end } = field
    setDraft(draft.slice(0, start) + open + draft.slice(start, end) + close + draft.slice(end))
    requestAnimationFrame(() => {
      field.focus()
      field.setSelectionRange(start + open.length, end + open.length)
    })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (draft.trim()) send()
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (draft.trim()) send()
  }

  return <form className="chat-composer" onSubmit={submit}>
    <div className="chat-format" aria-label="Formatting">
      <button type="button" aria-label="Bold" onClick={() => format('**')}><Bold size={15} /></button>
      <button type="button" aria-label="Italic" onClick={() => format('_')}><Italic size={15} /></button>
      <button type="button" aria-label="Insert link" onClick={() => format('https://', '')}><Link2 size={15} /></button>
    </div>
    <textarea ref={input} name="message" rows={2} maxLength={4000} autoComplete="off" aria-label={label} placeholder={label + '…'}
      value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={keyDown} />
    <div className="chat-compose-end">
      <button type="button" aria-label="Add a smile" onClick={() => format('🙂', '')}><Smile size={16} /></button>
      <span className="chat-send-hint">⌘ + Enter</span>
      <button className="chat-send" aria-label={label.startsWith('Reply') ? 'Send reply' : 'Send message'} disabled={!draft.trim()}><Send size={16} /></button>
    </div>
  </form>
}

function Attachment({ type }: { type: 'pdf' | 'figma' }) {
  if (type === 'pdf') return <a className="chat-attachment chat-pdf" href="/launch-kickoff.pdf" download>
    <span className="chat-file-icon"><FileText size={22} /></span>
    <span><strong>Launch kickoff.pdf</strong><small>PDF document</small></span>
    <ArrowDownToLine size={16} className="chat-file-action" />
  </a>
  return <a className="chat-attachment chat-figma" href="https://www.figma.com/community" target="_blank" rel="noreferrer" aria-label="Launch screens sample preview, opens Figma Community">
    <span className="chat-figma-art" aria-hidden="true"><i /><i /><i /></span>
    <span><small>FIGMA · SAMPLE PREVIEW</small><strong>Launch screens</strong><small>Onboarding examples</small></span>
    <ArrowUpRight size={16} className="chat-file-action" />
  </a>
}

function MessageRow({ message, onThread, onReaction, onBookmark }: {
  message: Message
  onThread: () => void
  onReaction: (emoji: string) => void
  onBookmark: () => void
}) {
  const [popover, setPopover] = useState<'emoji' | 'more'>()
  const [copied, setCopied] = useState('')
  const replies = message.replies ?? []
  return <article className="chat-message" onClick={event => {
    if (event.target instanceof Element && !event.target.closest('button,a') && !window.getSelection()?.toString()) onThread()
  }} onKeyDown={event => {
    if (event.key === 'Escape' && popover) setPopover(undefined)
  }}>
    <Avatar person={message.author} />
    <div className="chat-message-body">
      <div className="chat-message-meta"><strong>{people[message.author].name}</strong><time>{message.time}</time>{message.bookmarked && <Bookmark size={13} aria-label="Bookmarked" />}</div>
      {message.title && <button className="chat-message-title" type="button" onClick={onThread}>{message.title}</button>}
      <p>{richText(message.text)}</p>
      {message.attachment && <Attachment type={message.attachment} />}
      {message.reactions?.length ? <div className="chat-reactions">{message.reactions.map(({ emoji, count, active }) =>
        <button key={emoji} type="button" aria-label={`React ${emoji}, ${count}`} aria-pressed={!!active} onClick={() => onReaction(emoji)}>{emoji} <span>{count}</span></button>
      )}</div> : null}
      {replies.length > 0 && <button type="button" className="chat-reply-link" onClick={onThread}>
        <span className="chat-reply-avatars">{[...new Set(replies.map(reply => reply.author))].slice(0, 3).map(person => <Avatar key={person} person={person} />)}</span>
        <strong>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</strong><small>Last reply {replies.at(-1)?.time}</small>
      </button>}
    </div>
    <div className={`chat-message-actions${popover ? ' is-open' : ''}`}>
      <button type="button" aria-label="Add reaction" aria-expanded={popover === 'emoji'} onClick={() => setPopover(value => value === 'emoji' ? undefined : 'emoji')}><Smile size={16} /></button>
      <button type="button" aria-label="Reply in thread" onClick={onThread}><MessageSquare size={16} /></button>
      <button type="button" aria-label="Bookmark message" aria-pressed={!!message.bookmarked} onClick={onBookmark}><Bookmark size={16} /></button>
      <button type="button" aria-label="More message actions" aria-expanded={popover === 'more'} onClick={() => setPopover(value => value === 'more' ? undefined : 'more')}><MoreHorizontal size={16} /></button>
      {popover && <div className="chat-popover" aria-label={popover === 'emoji' ? 'Choose a reaction' : 'More message actions'}>
        {popover === 'emoji' ? emojis.map(emoji => <button type="button" key={emoji} aria-label={`Add ${emoji} reaction`} onClick={() => { onReaction(emoji); setPopover(undefined) }}>{emoji}</button>)
          : <button type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(message.text); setCopied('Message copied') }
            catch { setCopied('Could not copy the message') }
            setPopover(undefined)
          }}>Copy message</button>}
      </div>}
    </div>
    <span className="sr-only" role="status">{copied}</span>
  </article>
}

function Fold({ label, open, toggle, children }: { label: string; open: boolean; toggle: () => void; children: ReactNode }) {
  const id = 'chat-' + label.toLowerCase().replaceAll(' ', '-')
  return <section className="chat-fold">
    <button type="button" className="chat-fold-heading" aria-expanded={open} aria-controls={id} onClick={toggle}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{label}</button>
    <div id={id} hidden={!open}>{children}</div>
  </section>
}

export default function TeamChat({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState(initialMessages)
  const [active, setActive] = useState('project-launch')
  const [threadId, setThreadId] = useState('kickoff')
  const [mobileThread, setMobileThread] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [channelsOpen, setChannelsOpen] = useState(true)
  const [dmOpen, setDmOpen] = useState(true)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [unread, setUnread] = useState(true)
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const searchInput = useRef<HTMLInputElement>(null)
  const feed = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const threadHeading = useRef<HTMLHeadingElement>(null)
  const threadTrigger = useRef<HTMLElement | null>(null)
  const navTrigger = useRef<HTMLButtonElement>(null)
  const navClose = useRef<HTMLButtonElement>(null)
  const channel = channels.find(item => item.id === active)
  const person = channel ? undefined : people[active as Person]
  const name = channel ? '#' + active : person?.name ?? active
  const items = messages[active] ?? []
  const query = search.trim().toLowerCase()
  const visible = query ? items.filter(item => [item.text, item.title, people[item.author].name].some(text => text?.toLowerCase().includes(query))) : items
  const thread = items.find(item => item.id === threadId)
  const threadKey = active + '/' + threadId

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  function select(id: string) {
    setActive(id)
    setThreadId('')
    setMobileThread(false)
    if (mobileNav) requestAnimationFrame(() => heading.current?.focus())
    setMobileNav(false)
    setSearch('')
    if (id === 'project-launch') setUnread(false)
  }

  function updateMessage(id: string, update: (message: Message) => Message) {
    setMessages(previous => ({ ...previous, [active]: (previous[active] ?? []).map(message => message.id === id ? update(message) : message) }))
  }

  function react(id: string, emoji: string) {
    updateMessage(id, message => {
      const existing = message.reactions ?? []
      const reaction = existing.find(item => item.emoji === emoji)
      const reactions = reaction
        ? existing.map(item => item === reaction ? { ...item, active: !item.active, count: item.count + (item.active ? -1 : 1) } : item).filter(item => item.count > 0)
        : [...existing, { emoji, count: 1, active: true }]
      return { ...message, reactions }
    })
  }

  function openThread(id: string) {
    threadTrigger.current = document.activeElement as HTMLElement | null
    setThreadId(id)
    setMobileThread(true)
    requestAnimationFrame(() => threadHeading.current?.focus())
  }

  function closeThread() {
    setThreadId('')
    setMobileThread(false)
    requestAnimationFrame(() => (threadTrigger.current?.isConnected ? threadTrigger.current : heading.current)?.focus())
  }

  function closeNavigation() {
    setMobileNav(false)
    navTrigger.current?.focus()
  }

  function changeDraft(key: string, draft: string) {
    setDrafts(previous => ({ ...previous, [key]: draft }))
  }

  function send(reply: boolean) {
    const key = reply ? threadKey : active
    const text = drafts[key]?.trim()
    if (!text) return
    const message: Message = { id: crypto.randomUUID(), author: 'me', text, time: timeNow() }
    if (reply) updateMessage(threadId, previous => ({ ...previous, replies: [...(previous.replies ?? []), message] }))
    else {
      setMessages(previous => ({ ...previous, [active]: [...(previous[active] ?? []), message] }))
      setSearch('')
      requestAnimationFrame(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight })
    }
    changeDraft(key, '')
  }

  return <div lang="en" className={`chat-shell${thread ? ' has-thread' : ''}${mobileThread ? ' mobile-thread-open' : ''}`}>
    <a className="chat-skip" href="#chat-content" onClick={event => { event.preventDefault(); heading.current?.focus() }}>Skip to messages</a>
    <aside className={`chat-sidebar${mobileNav ? ' is-mobile-open' : ''}`} aria-label="Workspace navigation" onKeyDown={event => {
      if (event.key === 'Escape' && mobileNav) closeNavigation()
    }}>
      <header className="chat-workspace">
        <button type="button" className="chat-switcher" aria-expanded={workspaceOpen} aria-controls="chat-workspace-options" onClick={() => setWorkspaceOpen(value => !value)}>
          <span className="chat-workspace-mark" aria-hidden="true"><span /><span /></span><strong translate="no">Team Rocket</strong><ChevronDown size={15} />
        </button>
        <div id="chat-workspace-options" className="chat-workspace-options" hidden={!workspaceOpen}>
          <a href="#team" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onBack() }}><ArrowLeft size={15} /> t&amp;tech workspace</a>
        </div>
        <button ref={navClose} type="button" className="chat-mobile-close" aria-label="Close navigation" onClick={closeNavigation}><X size={18} /></button>
      </header>
      <nav className="chat-nav">
        <Fold label="Channels" open={channelsOpen} toggle={() => setChannelsOpen(value => !value)}>
          {channels.map(item => <button key={item.id} type="button" className="chat-nav-item" aria-pressed={active === item.id} onClick={() => select(item.id)}>
            <Hash size={16} /><span translate="no">{item.id}</span>{item.id === 'project-launch' && unread && <b className="chat-unread" aria-label="3 unread messages">3</b>}
          </button>)}
        </Fold>
        <Fold label="Direct messages" open={dmOpen} toggle={() => setDmOpen(value => !value)}>
          {directMessages.map(id => <button key={id} type="button" className="chat-nav-item chat-dm" aria-pressed={active === id} onClick={() => select(id)}>
            <Avatar person={id} status /><span>{people[id].name}</span>
          </button>)}
        </Fold>
      </nav>
      <footer className="chat-sidebar-footer"><Avatar person="me" status /><div><strong>Your account</strong><small>Online</small></div></footer>
    </aside>
    {mobileNav && <button className="chat-nav-backdrop" aria-label="Close channel list" type="button" onClick={closeNavigation} />}
    <main className="chat-main" id="chat-content">
      <header className="chat-channel-header">
        <button ref={navTrigger} className="chat-menu-button" type="button" aria-label="Open channel list" aria-expanded={mobileNav} onClick={() => {
          setMobileNav(true)
          requestAnimationFrame(() => navClose.current?.focus())
        }}><Menu size={21} /></button>
        <div className="chat-channel-title"><h1 ref={heading} tabIndex={-1}>{channel && <Hash size={21} aria-hidden="true" />}{channel?.id ?? name}</h1><p>{channel?.description ?? 'Direct message'}</p></div>
        {channel && <div className="chat-avatar-stack" aria-label="Participants">{directMessages.slice(0, 3).map(id => <Avatar key={id} person={id} />)}</div>}
        <label className="chat-search"><Search size={16} /><input ref={searchInput} name="search" type="search" autoComplete="off" aria-label="Search messages" placeholder="Search messages…" value={search} onChange={event => setSearch(event.target.value)} /><kbd><Command size={10} /> K</kbd></label>
      </header>
      <div className="chat-feed" ref={feed} aria-label={name + ' messages'} tabIndex={0}>
        <div className="chat-date"><span />{query ? `${visible.length} results` : 'Thursday, November 19'}<span /></div>
        {visible.length ? visible.map(message => <Fragment key={message.id}>
          {!query && unread && message.id === 'handoff' && <div className="chat-date chat-new-marker"><span />New messages<span /></div>}
          <MessageRow message={message} onThread={() => openThread(message.id)}
            onReaction={emoji => react(message.id, emoji)} onBookmark={() => updateMessage(message.id, item => ({ ...item, bookmarked: !item.bookmarked }))} />
        </Fragment>)
          : <p className="chat-empty">{query ? 'No messages match your search.' : 'No messages yet.'}</p>}
      </div>
      <footer className="chat-main-footer"><Composer label={`Message ${name}`} draft={drafts[active] ?? ''} setDraft={text => changeDraft(active, text)} send={() => send(false)} /></footer>
    </main>
    {thread && <aside className="chat-thread" aria-labelledby="chat-thread-title" onKeyDown={event => {
      if (event.key === 'Escape') closeThread()
    }}>
      <header className="chat-thread-header">
        <MessageSquare size={18} aria-hidden="true" />
        <div><h2 ref={threadHeading} id="chat-thread-title" tabIndex={-1}>Thread</h2><p>{thread.title ?? name}</p></div>
        <button type="button" aria-label="Close thread" onClick={closeThread}><X size={19} /></button>
      </header>
      <div className="chat-thread-scroll" tabIndex={0} aria-label="Thread messages">
        <ThreadMessage message={thread} root />
        <div className="chat-thread-count">{thread.replies?.length ?? 0} replies</div>
        {thread.replies?.map(reply => <ThreadMessage key={reply.id} message={reply} />)}
      </div>
      <footer className="chat-thread-footer"><Composer label="Reply in thread" draft={drafts[threadKey] ?? ''} setDraft={text => changeDraft(threadKey, text)} send={() => send(true)} /></footer>
    </aside>}
  </div>
}

function ThreadMessage({ message, root = false }: { message: Message; root?: boolean }) {
  return <article className={`chat-thread-message${root ? ' chat-thread-root' : ''}`}>
    <Avatar person={message.author} />
    <div><div className="chat-message-meta"><strong>{people[message.author].name}</strong><time>{message.time}</time></div>
      {root && message.title && <strong className="chat-thread-subject">{message.title}</strong>}
      <p>{richText(message.text)}</p>
    </div>
  </article>
}
