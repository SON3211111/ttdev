import { query, transaction } from './db.mjs'
import { created, found, idOf, listing, remove } from './http.mjs'
import { body, choice, date, invalid, recordInput } from './validation.mjs'

const projection = `CONVERT(varchar(20), record_id) AS id, record_type AS recordType, title, content,
  CONVERT(char(10), record_date, 23) AS recordDate, content_version AS contentVersion,
  embedding_status AS embeddingStatus, indexed_version AS indexedVersion, created_at AS createdAt, updated_at AS updatedAt`
const from = 'FROM records'
const types = ['MEMO', 'DIARY']
const fields = ['title', 'content', 'recordDate']

async function detail(db, id, lock = '') {
  const [row] = await query(db, `SELECT ${projection} ${from} ${lock} WHERE record_id = @id`, { id })
  return found(row, 'RECORD')
}

function versions(row) {
  return { ...row, contentVersion: Number(row.contentVersion), indexedVersion: row.indexedVersion == null ? null : Number(row.indexedVersion) }
}

export async function records(db, request, path, params) {
  if (path.length === 0 && request.method === 'GET') {
    const { type, start, end } = Object.fromEntries(params)
    if ((start !== undefined || end !== undefined) && (!start || !end || type !== undefined || start > end)) invalid()
    const where = start ? 'WHERE record_date BETWEEN @start AND @end' : type !== undefined ? 'WHERE record_type = @type' : ''
    const filter = start ? { start: date(start, 'start'), end: date(end, 'end') } : type !== undefined ? { type: choice(type, 'type', types) } : {}
    const page = await listing(db, projection, from + ' ' + where, 'record_date DESC, created_at DESC, record_id DESC', params, filter, ['type', 'start', 'end', 'page', 'size'])
    page.items = page.items.map(({ content, ...row }) => ({
      ...versions(row), preview: Array.from(content.replaceAll('\n', ' ')).slice(0, 120).join(''),
    }))
    return Response.json(page)
  }
  if (path.length === 0 && request.method === 'POST') {
    const input = await body(request, [...fields, 'recordType'])
    const recordType = choice(input.recordType, 'recordType', types)
    const [row] = await query(db, `INSERT INTO records (record_type,title,content,record_date,created_at,updated_at)
      OUTPUT inserted.record_id AS id VALUES (@recordType,@title,@content,@recordDate,SYSUTCDATETIME(),SYSUTCDATETIME())`,
    { ...recordInput(input, recordType), recordType })
    return created('records', versions(await detail(db, row.id)))
  }
  if (path.length !== 1) return
  const id = idOf(path[0])
  if (request.method === 'GET') return Response.json(versions(await detail(db, id)))
  if (request.method === 'DELETE') return remove(db, 'records', 'record_id', id, 'RECORD')
  if (request.method === 'PUT') {
    const input = await body(request, fields)
    const updated = await transaction(db, async tx => {
      const current = await detail(tx, id, 'WITH (UPDLOCK, HOLDLOCK)')
      const value = recordInput(input, current.recordType)
      if (fields.every(field => current[field] === value[field])) return current
      await query(tx, `UPDATE records SET title=@title, content=@content, record_date=@recordDate,
        content_version=content_version+1, embedding_status='PENDING', updated_at=SYSUTCDATETIME() WHERE record_id=@id`, { ...value, id })
      return detail(tx, id)
    })
    return Response.json(versions(updated))
  }
}
