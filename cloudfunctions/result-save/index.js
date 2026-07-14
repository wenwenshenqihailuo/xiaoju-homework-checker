const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  console.log('result-save called:', { action, hasData: !!data, openid: OPENID })

  try {
    switch (action) {
      case 'saveResultData':
        return await saveResultData(data, OPENID)
      case 'mergeAnalysisByTime':
        return await mergeAnalysisByTime(data)
      case 'getAnalysisHistory':
        return await getAnalysisHistory(data, OPENID)
      case 'getSavedAnalysisResult':
        return await getSavedAnalysisResult(data, OPENID)
      case 'deleteAnalysisHistory':
        return await deleteAnalysisHistory(event.recordId, OPENID)
      default:
        return {
          success: false,
          error: `无效的操作类型: ${action || 'unknown'}`
        }
    }
  } catch (error) {
    console.error('result-save failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

async function deleteAnalysisHistory(recordId, openid) {
  if (!recordId || !openid) {
    return { success: false, error: '缺少必要参数' }
  }

  try {
    const record = await db.collection('user_analysis_history').doc(recordId).get()
    const historyRecord = record.data
    const ownerOpenId = getRecordOwnerOpenId(historyRecord)

    if (!ownerOpenId) {
      return { success: false, error: '记录缺少归属信息，禁止删除' }
    }

    if (ownerOpenId !== openid) {
      return { success: false, error: '无权限删除此记录' }
    }

    await db.collection('user_analysis_history').doc(recordId).remove()

    console.log('history deleted:', { recordId, openid })
    return { success: true }
  } catch (error) {
    console.error('deleteAnalysisHistory failed:', error)
    return { success: false, error: error.message }
  }
}

async function saveResultData(resultData, openid) {
  try {
    if (!resultData || (!resultData.taskId && !resultData.analysisRecordId)) {
      throw new Error('缺少必要的标识字段：taskId 或 analysisRecordId')
    }

    const processedData = processAnalysisData(resultData)
    const existingRecord = await findExistingSavedResult(resultData, openid)

    if (existingRecord) {
      await upsertUserHistoryRecord(existingRecord._id, resultData, processedData.statistics, openid)
      return {
        success: true,
        recordId: existingRecord._id,
        collectionName: 'ai_analysis_results',
        message: '结果已存在，已复用原保存记录',
        historySaved: true,
        dataProcessed: true,
        reusedExisting: true
      }
    }

    const dataToSave = {
      ...processedData,
      createTime: resultData.createTime ? new Date(resultData.createTime) : new Date(),
      updateTime: new Date(),
      status: resultData.status || 'completed',
      source: 'result_page',
      ownerOpenId: openid || null,
      version: '1.0',
      saveType: 'complete_analysis'
    }

    const saveResult = await db.collection('ai_analysis_results').add({
      data: dataToSave
    })

    await upsertUserHistoryRecord(saveResult._id, resultData, dataToSave.statistics, openid)

    return {
      success: true,
      recordId: saveResult._id,
      collectionName: 'ai_analysis_results',
      message: '结果保存成功',
      historySaved: true,
      dataProcessed: true
    }
  } catch (error) {
    console.error('saveResultData failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

async function findExistingSavedResult(resultData, openid) {
  if (resultData.analysisRecordId) {
    try {
      const existingById = await db.collection('ai_analysis_results')
        .doc(resultData.analysisRecordId)
        .get()

      if (
        existingById.data &&
        existingById.data.source === 'result_page' &&
        (!openid || existingById.data.ownerOpenId === openid)
      ) {
        return existingById.data
      }
    } catch (error) {
      console.warn('findExistingSavedResult by analysisRecordId failed:', error)
    }
  }

  if (resultData.taskId) {
    const existingByTask = await db.collection('ai_analysis_results')
      .where({
        taskId: resultData.taskId,
        source: 'result_page',
        ownerOpenId: openid || null
      })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()

    if (existingByTask.data && existingByTask.data.length > 0) {
      return existingByTask.data[0]
    }
  }

  return null
}

async function upsertUserHistoryRecord(analysisRecordId, resultData, statistics, openid) {
  const historyData = {
    analysisRecordId,
    taskId: resultData.taskId || null,
    overallScore: resultData.overallScore || 0,
    itemCount: resultData.itemCount || 0,
    createTime: new Date(),
    updateTime: new Date(),
    simpleFormatData: resultData.simpleFormatData || [],
    fileID: resultData.fileID || null,
    segmentCount: resultData.segmentCount || 0,
    statistics: statistics || null,
    ownerOpenId: openid || null
  }

  const existingHistory = await db.collection('user_analysis_history')
    .where({
      analysisRecordId,
      ownerOpenId: openid || null
    })
    .limit(1)
    .get()

  if (existingHistory.data && existingHistory.data.length > 0) {
    const existingRecord = existingHistory.data[0]
    const { createTime, ...updateData } = historyData

    await db.collection('user_analysis_history')
      .doc(existingRecord._id)
      .update({
        data: updateData
      })

    return existingRecord._id
  }

  const addResult = await db.collection('user_analysis_history').add({
    data: historyData
  })

  return addResult._id
}

function processAnalysisData(resultData) {
  const processed = { ...resultData }

  if (processed.questionResults && Array.isArray(processed.questionResults)) {
    processed.questionResults = processed.questionResults.map((question, questionIndex) => {
      const normalizedQuestion = { ...question }

      if (normalizedQuestion.itemResults && Array.isArray(normalizedQuestion.itemResults)) {
        normalizedQuestion.itemResults = normalizedQuestion.itemResults.map((item, itemIndex) => {
          const normalizedItem = { ...item }
          normalizedItem.itemIndex = itemIndex + 1

          if (normalizedItem.analysis) {
            normalizedItem.formattedAnalysis = `${normalizedItem.itemIndex}. ${normalizedItem.analysis}`
          }

          return normalizedItem
        })

        normalizedQuestion.itemIndex = questionIndex + 1
        normalizedQuestion.itemCount = normalizedQuestion.itemResults.length
        normalizedQuestion.correctItems = normalizedQuestion.itemResults.filter(item => item.isCorrect).length
        normalizedQuestion.accuracy = normalizedQuestion.itemCount > 0
          ? (normalizedQuestion.correctItems / normalizedQuestion.itemCount * 100).toFixed(2)
          : 0
      }

      return normalizedQuestion
    })
  }

  if (processed.questionResults && processed.questionResults.length > 0) {
    const totalItems = processed.questionResults.reduce((sum, question) => {
      return sum + (question.itemResults ? question.itemResults.length : 0)
    }, 0)

    const correctItems = processed.questionResults.reduce((sum, question) => {
      if (!question.itemResults) {
        return sum
      }

      return sum + question.itemResults.filter(item => item.isCorrect).length
    }, 0)

    processed.statistics = {
      ...processed.statistics,
      totalItems,
      correctItems,
      accuracy: totalItems > 0 ? (correctItems / totalItems * 100).toFixed(2) : 0,
      processedAt: new Date()
    }
  }

  return processed
}

async function mergeAnalysisByTime(data = {}) {
  try {
    const {
      timeRange,
      targetTime,
      analysisField = 'analysis',
      outputCollection = 'merged_analysis_results'
    } = data

    let query = {}

    if (targetTime) {
      query.createTime = new Date(targetTime)
    } else if (timeRange) {
      const { startTime, endTime } = timeRange

      if (startTime && endTime) {
        query.createTime = db.command.gte(new Date(startTime)).and(db.command.lte(new Date(endTime)))
      } else if (startTime) {
        query.createTime = db.command.gte(new Date(startTime))
      } else if (endTime) {
        query.createTime = db.command.lte(new Date(endTime))
      }
    }

    let queryBuilder = db.collection('ai_analysis_results')
    if (Object.keys(query).length > 0) {
      queryBuilder = queryBuilder.where(query)
    }

    const result = await queryBuilder.orderBy('createTime', 'asc').get()
    if (!result.data || result.data.length === 0) {
      return {
        success: false,
        error: '没有找到符合条件的分析结果记录'
      }
    }

    const mergedAnalysis = []
    let recordCount = 0

    result.data.forEach(record => {
      if (record[analysisField]) {
        recordCount += 1
        mergedAnalysis.push(`${recordCount}. ${record[analysisField]}`)
      }
    })

    if (mergedAnalysis.length === 0) {
      return {
        success: false,
        error: `没有找到包含 ${analysisField} 字段的记录`
      }
    }

    const mergedRecord = {
      originalRecordCount: result.data.length,
      analysisCount: mergedAnalysis.length,
      mergedAnalysis,
      mergedText: mergedAnalysis.join('\n'),
      timeRange: {
        startTime: result.data[0].createTime,
        endTime: result.data[result.data.length - 1].createTime
      },
      originalRecordIds: result.data.map(record => record._id),
      createTime: new Date(),
      updateTime: new Date(),
      status: 'merged'
    }

    const saveResult = await db.collection(outputCollection).add({
      data: mergedRecord
    })

    return {
      success: true,
      recordId: saveResult._id,
      collectionName: outputCollection,
      mergedAnalysis,
      mergedText: mergedRecord.mergedText,
      originalRecordCount: result.data.length,
      analysisCount: mergedAnalysis.length,
      message: '分析结果合并成功'
    }
  } catch (error) {
    console.error('mergeAnalysisByTime failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

async function getAnalysisHistory(data = {}, openid) {
  try {
    const {
      limit = 20,
      offset = 0,
      startDate,
      endDate
    } = data

    if (!openid) {
      return {
        success: false,
        error: '未获取到用户身份'
      }
    }

    const queryLimit = Math.max(limit + offset + 1, 20)

    const ownerResult = await db.collection('user_analysis_history')
      .where({ ownerOpenId: openid })
      .orderBy('createTime', 'desc')
      .limit(queryLimit)
      .get()

    const legacyResult = await db.collection('user_analysis_history')
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .limit(queryLimit)
      .get()

    const mergedMap = new Map()
    ;[...(ownerResult.data || []), ...(legacyResult.data || [])].forEach(record => {
      if (!record || !record._id) {
        return
      }

      if (!isRecordOwnedByUser(record, openid)) {
        return
      }

      if (!isRecordWithinDateRange(record, startDate, endDate)) {
        return
      }

      if (!mergedMap.has(record._id)) {
        mergedMap.set(record._id, record)
      }
    })

    const mergedRecords = sortRecordsByCreateTimeDesc(Array.from(mergedMap.values()))
    const pagedRecords = mergedRecords.slice(offset, offset + limit)

    return {
      success: true,
      data: pagedRecords,
      total: pagedRecords.length,
      hasMore: mergedRecords.length > offset + limit
    }
  } catch (error) {
    console.error('getAnalysisHistory failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

async function getSavedAnalysisResult(data = {}, openid) {
  try {
    const { analysisRecordId, taskId } = data

    if (!openid) {
      return {
        success: false,
        error: '未获取到用户身份'
      }
    }

    if (!analysisRecordId && !taskId) {
      return {
        success: false,
        error: '缺少必要参数'
      }
    }

    const historyRecord = await findOwnedHistoryRecord({ analysisRecordId, taskId }, openid)
    if (!historyRecord) {
      return {
        success: false,
        error: '未找到对应的历史记录'
      }
    }

    let analysisRecord = null

    if (historyRecord.analysisRecordId) {
      try {
        const result = await db.collection('ai_analysis_results')
          .doc(historyRecord.analysisRecordId)
          .get()

        analysisRecord = result.data || null
      } catch (error) {
        console.warn('getSavedAnalysisResult by analysisRecordId failed:', error)
      }
    }

    if (!analysisRecord && historyRecord.taskId) {
      analysisRecord = await findOwnedAnalysisResultByTaskId(historyRecord.taskId, openid)
    }

    if (!analysisRecord) {
      return {
        success: false,
        error: '未找到已保存的分析结果'
      }
    }

    const ownerOpenId = getRecordOwnerOpenId(analysisRecord)
    if (ownerOpenId && ownerOpenId !== openid) {
      return {
        success: false,
        error: '无权限查看此分析结果'
      }
    }

    return {
      success: true,
      data: analysisRecord,
      historyRecordId: historyRecord._id
    }
  } catch (error) {
    console.error('getSavedAnalysisResult failed:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

function getRecordOwnerOpenId(record) {
  if (!record) {
    return null
  }

  return record.ownerOpenId || record._openid || null
}

function isRecordOwnedByUser(record, openid) {
  if (!openid) {
    return false
  }

  return getRecordOwnerOpenId(record) === openid
}

function isRecordWithinDateRange(record, startDate, endDate) {
  const createTime = new Date(record.createTime || 0).getTime()
  const startTime = startDate ? new Date(startDate).getTime() : null
  const endTime = endDate ? new Date(endDate).getTime() : null

  if (startTime && createTime < startTime) {
    return false
  }

  if (endTime && createTime > endTime) {
    return false
  }

  return true
}

function sortRecordsByCreateTimeDesc(records) {
  return [...records].sort((a, b) => {
    const timeA = new Date(a.createTime || 0).getTime()
    const timeB = new Date(b.createTime || 0).getTime()
    return timeB - timeA
  })
}

async function getHistoryRecordsByField(fieldName, fieldValue, openid) {
  if (!fieldValue || !openid) {
    return []
  }

  const result = await db.collection('user_analysis_history')
    .where({
      [fieldName]: fieldValue
    })
    .orderBy('createTime', 'desc')
    .limit(20)
    .get()

  return (result.data || []).filter(record => isRecordOwnedByUser(record, openid))
}

async function findOwnedHistoryRecord({ analysisRecordId, taskId }, openid) {
  let candidates = []

  if (analysisRecordId) {
    candidates = candidates.concat(
      await getHistoryRecordsByField('analysisRecordId', analysisRecordId, openid)
    )
  }

  if (taskId) {
    candidates = candidates.concat(
      await getHistoryRecordsByField('taskId', taskId, openid)
    )
  }

  const uniqueCandidates = []
  const seenIds = new Set()

  candidates.forEach(record => {
    if (record && record._id && !seenIds.has(record._id)) {
      seenIds.add(record._id)
      uniqueCandidates.push(record)
    }
  })

  return sortRecordsByCreateTimeDesc(uniqueCandidates)[0] || null
}

async function findOwnedAnalysisResultByTaskId(taskId, openid) {
  if (!taskId || !openid) {
    return null
  }

  const result = await db.collection('ai_analysis_results')
    .where({
      taskId,
      ownerOpenId: openid
    })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()

  if (result.data && result.data.length > 0) {
    return result.data[0]
  }

  return null
}
