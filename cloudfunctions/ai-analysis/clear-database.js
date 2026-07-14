const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const ARCHIVE_COLLECTION = 'database_delete_archive'
const ARCHIVE_BATCH_COLLECTION = 'database_delete_batches'
const DEFAULT_TARGET_COLLECTIONS = [
  'users',
  'ocr_records',
  'segments',
  'ai_analysis_tasks',
  'ai_analysis_results',
  'user_analysis_history',
  'merged_analysis_results'
]
const BATCH_SIZE = 100

exports.main = async (event, context) => {
  const {
    adminKey,
    collections,
    reason = 'manual_clear_database'
  } = event

  validateAdminKey(adminKey)

  const wxContext = cloud.getWXContext()
  const operatorOpenId = wxContext.OPENID || 'unknown'
  const batchId = `clear_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const targetCollections = resolveTargetCollections(collections)
  const archiveEnabled = resolveArchiveEnabled(event)
  const results = []

  if (archiveEnabled) {
    await ensureArchiveCollections()
  }

  for (const collectionName of targetCollections) {
    const result = await archiveAndClearCollection(collectionName, {
      batchId,
      operatorOpenId,
      reason,
      archiveEnabled
    })
    results.push(result)
  }

  if (archiveEnabled) {
    const summary = {
      batchId,
      operatorOpenId,
      reason,
      targetCollections,
      results,
      archiveCollection: ARCHIVE_COLLECTION,
      createTime: new Date()
    }

    await db.collection(ARCHIVE_BATCH_COLLECTION).add({
      data: summary
    })
  }

  return {
    success: true,
    batchId,
    archiveEnabled,
    archiveCollection: archiveEnabled ? ARCHIVE_COLLECTION : null,
    archiveBatchCollection: archiveEnabled ? ARCHIVE_BATCH_COLLECTION : null,
    results
  }
}

function validateAdminKey(adminKey) {
  const expectedAdminKey = process.env.ADMIN_CLEAR_KEY

  if (!expectedAdminKey) {
    throw new Error('缺少云函数环境变量 ADMIN_CLEAR_KEY')
  }

  if (!adminKey || adminKey !== expectedAdminKey) {
    throw new Error('管理员口令无效，拒绝执行清库')
  }
}

function resolveTargetCollections(collections) {
  if (!Array.isArray(collections) || collections.length === 0) {
    return DEFAULT_TARGET_COLLECTIONS
  }

  return collections.filter(name => DEFAULT_TARGET_COLLECTIONS.includes(name))
}

function resolveArchiveEnabled(event = {}) {
  if (typeof event.enableArchive === 'boolean') {
    return event.enableArchive
  }

  if (typeof event.withArchive === 'boolean') {
    return event.withArchive
  }

  if (typeof event.skipArchive === 'boolean') {
    return !event.skipArchive
  }

  return true
}

async function ensureArchiveCollections() {
  await ensureCollectionExists(ARCHIVE_COLLECTION)
  await ensureCollectionExists(ARCHIVE_BATCH_COLLECTION)
}

async function ensureCollectionExists(collectionName) {
  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (!isCollectionAlreadyExistsError(error)) {
      throw error
    }
  }
}

function isCollectionAlreadyExistsError(error) {
  const message = error && error.message ? error.message : ''
  return /already exists/i.test(message)
}

async function archiveAndClearCollection(collectionName, meta) {
  let archivedCount = 0
  let deletedCount = 0

  try {
    while (true) {
      const result = await db.collection(collectionName)
        .limit(BATCH_SIZE)
        .get()

      const records = result.data || []
      if (records.length === 0) {
        break
      }

      if (meta.archiveEnabled) {
        await archiveRecords(collectionName, records, meta)
        archivedCount += records.length
      }

      const ids = records.map(record => record._id)
      await db.collection(collectionName)
        .where({
          _id: _.in(ids)
        })
        .remove()

      deletedCount += records.length
    }

    return {
      collection: collectionName,
      archivedCount,
      deletedCount,
      archiveEnabled: !!meta.archiveEnabled,
      success: true
    }
  } catch (error) {
    return {
      collection: collectionName,
      archivedCount,
      deletedCount,
      archiveEnabled: !!meta.archiveEnabled,
      success: false,
      error: error.message
    }
  }
}

async function archiveRecords(collectionName, records, meta) {
  for (const record of records) {
    await db.collection(ARCHIVE_COLLECTION).add({
      data: {
        batchId: meta.batchId,
        sourceCollection: collectionName,
        sourceId: record._id,
        deletedAt: new Date(),
        operatorOpenId: meta.operatorOpenId,
        reason: meta.reason,
        payload: record
      }
    })
  }
}
