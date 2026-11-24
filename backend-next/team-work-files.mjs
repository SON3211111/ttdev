import { query, transaction } from './db.mjs'
import { found } from './http.mjs'
import { ApiError, text, validate } from './validation.mjs'

const maxBytes = 5 * 1024 * 1024
const signatures = new Map([
  ['application/pdf', Buffer.from('%PDF-')],
  ['image/png', Buffer.from('89504e470d0a1a0a', 'hex')],
  ['image/jpeg', Buffer.from('ffd8ff', 'hex')],
])
const metadata = 'id,filename,content_type AS type,DATALENGTH(content) AS size,created_at AS createdAt'

export async function readAttachment(request, inputName) {
  const filename = text(inputName, 'name', 140, true)
  if (/[\\/\x00-\x1f\x7f]/.test(filename)) validate('name', '파일 이름을 확인해 주세요.')
  const type = request.headers.get('content-type')
  const signature = signatures.get(type)
  if (!signature || !request.body) validate('file', 'PDF, PNG, JPEG 파일을 선택해 주세요.')

  const tooLarge = () => new ApiError(413, 'FILE_TOO_LARGE', '첨부 파일은 5MB까지 올릴 수 있습니다.')
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge()
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        throw tooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const data = Buffer.concat(chunks, size)
  if (!data.subarray(0, signature.length).equals(signature)) validate('file', '파일 형식과 내용이 일치하지 않습니다.')
  return { filename, type, data }
}

export async function workAttachments(db, request, params, workId, fileId, userId, read, canEdit) {
  const bindings = { workId, fileId }
  if (request.method === 'GET') {
    await read(db)
    if (!fileId) return Response.json(await query(db, `SELECT ${metadata} FROM team_work_files WHERE work_id=@workId ORDER BY id DESC`, { workId }))
    const [file] = await query(db, `SELECT filename,content_type AS type,content FROM team_work_files WHERE work_id=@workId AND id=@fileId`, bindings)
    const item = found(file, 'FILE')
    const filename = encodeURIComponent(item.filename).replace(/[!'()*]/g, value => '%' + value.charCodeAt(0).toString(16))
    return new Response(item.content, { headers: {
      'Content-Type': item.type,
      'Content-Disposition': "attachment; filename*=UTF-8''" + filename,
      'X-Content-Type-Options': 'nosniff',
    } })
  }

  const upload = request.method === 'POST' && !fileId
  const remove = request.method === 'DELETE' && !!fileId
  if (!upload && !remove) return
  const requireEdit = work => {
    if (!canEdit(work)) throw new ApiError(403, 'FORBIDDEN', '첨부를 변경할 권한이 없습니다.')
  }
  if (upload) requireEdit(await read(db))
  const payload = upload ? await readAttachment(request, params.get('name')) : undefined
  return transaction(db, async tx => {
    requireEdit(await read(tx, true))
    if (remove) {
      const [removed] = await query(tx, 'DELETE FROM team_work_files OUTPUT deleted.id WHERE work_id=@workId AND id=@fileId', bindings)
      found(removed, 'FILE')
      return new Response(null, { status: 204 })
    }
    const [{ total }] = await query(tx, 'SELECT COUNT(*) AS total FROM team_work_files WHERE work_id=@workId', { workId })
    if (total >= 10) throw new ApiError(409, 'FILE_LIMIT', '업무당 파일은 10개까지 첨부할 수 있습니다.')
    const [{ id }] = await query(tx, `INSERT INTO team_work_files(work_id,uploaded_by,filename,content_type,content)
      OUTPUT inserted.id VALUES (@workId,@userId,@filename,@type,@data)`, { workId, userId, ...payload })
    const [saved] = await query(tx, `SELECT ${metadata} FROM team_work_files WHERE work_id=@workId AND id=@id`, { workId, id })
    return Response.json(saved, { status: 201 })
  })
}
