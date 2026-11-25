import { createHash } from 'node:crypto'
import { canViewAll } from './team-auth.mjs'

const collection = 'ttech_' + (process.env.SQLSERVER_DATABASE ?? 'appdb') + '_bge_m3_v1'
const dimensions = 1024

export function sourceFingerprint({ route, title, context, date, excerpt, owner, team }) {
  return createHash('sha256').update(JSON.stringify([route, title, context, date, excerpt, owner, team])).digest('hex')
}

export function vectorFilter(user) {
  const should = [{ key: 'scope', match: { value: 'owner:' + user.id } }]
  if (canViewAll(user)) should.push({ key: 'kind', match: { value: 'team' } })
  else if (user.teamId) should.push({ key: 'scope', match: { value: 'team:' + user.teamId } })
  return { should }
}

export function mergeAssistantSources(keywords, current, hits) {
  const byRoute = new Map(current.map(source => [source.route, source]))
  const semantic = hits.flatMap(hit => {
    const source = byRoute.get(hit.route)
    return source && sourceFingerprint(source) === hit.fingerprint ? [source] : []
  })
  const results = new Map()
  for (const source of [...keywords.slice(0, 3), ...semantic, ...keywords.slice(3)]) {
    if (!results.has(source.route)) results.set(source.route, source)
    if (results.size === 5) break
  }
  return [...results.values()]
}

async function request(base, path, method, data, signal) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    signal,
  })
  if (!response.ok) throw Object.assign(new Error(`${method} ${path} HTTP ${response.status}`), { status: response.status })
  return response.json()
}

function qdrant(path, method, data, signal = AbortSignal.timeout(10000)) {
  return request(process.env.QDRANT_URL ?? 'http://qdrant:6333', '/collections/' + collection + path, method, data, signal)
}

async function embed(input, signal) {
  const { embeddings } = await request(process.env.OLLAMA_URL ?? 'http://ollama:11434', '/api/embed', 'POST',
    { model: 'bge-m3', input }, signal)
  if (embeddings?.length !== input.length || embeddings.some(vector => vector.length !== dimensions)) {
    throw new Error('Unexpected bge-m3 embedding dimensions')
  }
  return embeddings
}

export async function vectorHits(question, user, requestSignal) {
  if (process.env.ASSISTANT_VECTOR_ENABLED === 'false') return []
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(10000)])
  try {
    await qdrant('', 'GET', undefined, signal)
    const [vector] = await embed([question], signal)
    const { result } = await qdrant('/points/query', 'POST', {
      query: vector, filter: vectorFilter(user), limit: 16, score_threshold: 0.5,
      with_payload: ['route', 'fingerprint'],
    }, signal)
    return result.points.map(point => point.payload).filter(payload => typeof payload?.route === 'string' && typeof payload.fingerprint === 'string')
  } catch {
    return []
  }
}

function pointId(route) {
  const hex = createHash('sha256').update(route).digest('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-')
}

export async function syncAssistantIndex(sources) {
  let payloadSchema
  try {
    payloadSchema = (await qdrant('', 'GET')).result.payload_schema
  } catch (error) {
    if (error.status !== 404) throw error
    await qdrant('', 'PUT', { vectors: { size: dimensions, distance: 'Cosine' } })
  }
  // Qdrant 작업이 중단되면 다음 실행에서 동일한 포인트 ID로 다시 시도합니다.
  for (const field_name of ['scope', 'kind']) {
    if (!payloadSchema?.[field_name]) await qdrant('/index?wait=true', 'PUT', { field_name, field_schema: 'keyword' })
  }
  const existing = new Map()
  let offset
  do {
    const { result } = await qdrant('/points/scroll', 'POST', { offset, limit: 256, with_payload: ['fingerprint'], with_vector: false })
    for (const point of result.points) existing.set(point.id, point.payload?.fingerprint)
    offset = result.next_page_offset
  } while (offset != null)

  const pending = []
  for (const source of sources) {
    const id = pointId(source.route)
    const fingerprint = sourceFingerprint(source)
    if (existing.get(id) !== fingerprint) pending.push({ source, id, fingerprint })
    existing.delete(id)
  }

  const deleted = [...existing.keys()]
  for (let i = 0; i < deleted.length; i += 256) {
    await qdrant('/points/delete?wait=true', 'POST', { points: deleted.slice(i, i + 256) })
  }
  for (let i = 0; i < pending.length; i += 16) {
    const batch = pending.slice(i, i + 16)
    const vectors = await embed(batch.map(({ source }) => [source.title, source.context, source.excerpt].join('\n')),
      AbortSignal.timeout(180000))
    await qdrant('/points?wait=true', 'PUT', { points: batch.map(({ source, id, fingerprint }, index) => ({
      id, vector: vectors[index], payload: {
        route: source.route, fingerprint, kind: source.owner == null ? 'team' : 'personal',
        scope: source.owner == null ? 'team:' + source.team : 'owner:' + source.owner,
      },
    })) })
  }
  return { total: sources.length, upserted: pending.length, deleted: deleted.length }
}
