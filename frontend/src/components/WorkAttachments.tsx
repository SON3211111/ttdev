import { useEffect, useState, type FormEvent } from 'react'
import { teamGet, teamWrite, withTeam } from '../api/team'

type FileItem = { id: number; filename: string; size: number }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '첨부 파일을 처리하지 못했습니다.'
}

export default function WorkAttachments({ path, teamId, canEdit }: { path: string; teamId?: number; canEdit: boolean }) {
  const [files, setFiles] = useState<FileItem[]>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const base = withTeam(path, teamId)

  useEffect(() => {
    const controller = new AbortController()
    teamGet<FileItem[]>(base, controller.signal).then(setFiles).catch(error => {
      if (!controller.signal.aborted) setError(errorMessage(error))
    })
    return () => controller.abort()
  }, [base])

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get('attachment')
    if (!(file instanceof File) || !file.size) return
    setError('')
    if (file.size > 5 * 1024 * 1024) {
      setError('첨부 파일은 5MB까지 올릴 수 있습니다.')
      return
    }
    setPending(true)
    try {
      const url = new URL('/api/team/' + base, location.origin)
      url.searchParams.set('name', file.name)
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': file.type },
        body: file, signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.fieldErrors?.[0]?.message || payload?.message || '첨부 파일을 저장하지 못했습니다.')
      }
      const item: FileItem = await response.json()
      setFiles(previous => [item, ...(previous ?? [])])
      form.reset()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  async function remove(file: FileItem) {
    setError('')
    setPending(true)
    try {
      await teamWrite(withTeam(path + '/' + file.id, teamId), 'DELETE')
      setFiles(previous => previous?.filter(item => item.id !== file.id))
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return <section className="sw-work-files" aria-label="첨부 파일">
    <h3>첨부 파일</h3>
    {error && <p role="alert" className="sw-error">{error}</p>}
    {files?.length === 0 && <p>첨부된 파일이 없습니다.</p>}
    {!!files?.length && <ul>{files.map(file => <li key={file.id}>
      <a href={'/api/team/' + withTeam(path + '/' + file.id, teamId)} download>{file.filename}</a>
      <small>{Math.ceil(file.size / 1024)}KB</small>
      {canEdit && <button className="sw-secondary" type="button" disabled={pending}
        aria-label={file.filename + ' 삭제'} onClick={() => { if (window.confirm('이 첨부 파일을 삭제할까요?')) void remove(file) }}>삭제</button>}
    </li>)}</ul>}
    {canEdit && files && <form onSubmit={upload}>
      <label>파일 선택<input type="file" name="attachment" accept="application/pdf,image/png,image/jpeg" required disabled={pending} /></label>
      <button className="sw-secondary" type="submit" disabled={pending}>첨부</button>
      <small>PDF·PNG·JPEG, 파일당 최대 5MB</small>
    </form>}
  </section>
}
