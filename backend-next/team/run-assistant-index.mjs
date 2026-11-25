import { setTimeout } from 'node:timers/promises'
import { database, query } from '../db/db.mjs'
import { assistantSourceRows } from './team-assistant.mjs'
import { syncAssistantIndex } from './assistant-vector.mjs'

const once = process.argv.includes('--once')
do {
  try {
    const db = await database()
    const sources = await query(db, `SELECT route,title,context,[date],excerpt,owner,team FROM ${assistantSourceRows} source`)
    const result = await syncAssistantIndex(sources)
    if (once || result.upserted || result.deleted) console.log('Assistant index synchronized', result)
    if (once) {
      await db.close()
      break
    }
  } catch (error) {
    console.error('Assistant index failed', error.code ?? error.message)
    if (once) process.exit(1)
  }
  await setTimeout(60000)
} while (!once)
