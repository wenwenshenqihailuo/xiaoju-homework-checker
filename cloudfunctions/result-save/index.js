// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data } = event
  
  console.log('result-save 云函数被调用:', { action, data })
  
  try {
    switch (action) {
      case 'saveResultData':
        return await saveResultData(data)
      
      case 'mergeAnalysisByTime':
        return await mergeAnalysisByTime(data)
      
      case 'getAnalysisHistory':
        return await getAnalysisHistory(data)

      case 'deleteAnalysisHistory':
        const { OPENID } = cloud.getWXContext();
        return await deleteAnalysisHistory(event.recordId, OPENID);
      
      default:
        return {
          success: false,
          error: `无效的操作类型: ${action}`
        }
    }
  } catch (error) {
    console.error('result-save 云函数执行失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 删除单条历史记录
async function deleteAnalysisHistory(recordId, openid) {
  if (!recordId || !openid) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    // 获取记录
    const record = await db.collection('user_analysis_history').doc(recordId).get();
    
    // 权限验证：如果记录有 openid，则必须匹配；如果没有 openid，允许删除
    if (record.data._openid && record.data._openid !== openid) {
      return { success: false, error: '无权限删除此记录' };
    }
    
    // 如果没有 openid，记录警告但允许删除
    if (!record.data._openid) {
      console.warn(`记录 ${recordId} 没有 openid，允许删除`);
    }

    // 执行删除
    await db.collection('user_analysis_history').doc(recordId).remove();
    
    console.log(`历史记录删除成功, recordId: ${recordId}, openid: ${openid}`);
    return { success: true };

  } catch (error) {
    console.error('删除历史记录失败:', error);
    return { success: false, error: error.message };
  }
}

// 保存结果页面的分析结果
async function saveResultData(resultData) {
  try {
    console.log('开始保存结果页面分析结果:', resultData)
    
    // 验证必要字段
    if (!resultData.taskId && !resultData.analysisRecordId) {
      throw new Error('缺少必要的标识字段：taskId 或 analysisRecordId')
    }
    
    // 处理分析结果数据
    const processedData = processAnalysisData(resultData)
    
    // 准备保存的数据
    const dataToSave = {
      ...processedData,
      createTime: resultData.createTime || new Date(),
      updateTime: new Date(),
      status: resultData.status || 'completed',
      source: 'result_page',
      version: '1.0',
      saveType: 'complete_analysis'
    }
    
    // 保存到 ai_analysis_results 集合
    const saveResult = await db.collection('ai_analysis_results').add({
      data: dataToSave
    })
    
    console.log(`结果页面分析结果已保存，记录ID: ${saveResult._id}`)
    
    // 保存到用户分析历史集合
    try {
      const historyData = {
        analysisRecordId: saveResult._id,
        taskId: resultData.taskId,
        overallScore: resultData.overallScore,
        itemCount: resultData.itemCount,
        createTime: new Date(),
        simpleFormatData: resultData.simpleFormatData,
        fileID: resultData.fileID,
        segmentCount: resultData.segmentCount,
        statistics: dataToSave.statistics
      }
      
      await db.collection('user_analysis_history').add({
        data: historyData
      })
      
      console.log('分析结果已同时保存到用户历史记录')
    } catch (historyError) {
      console.warn('保存到用户历史记录失败，但不影响主要保存:', historyError)
    }
    
    return {
      success: true,
      recordId: saveResult._id,
      collectionName: 'ai_analysis_results',
      message: '结果页面分析结果保存成功',
      historySaved: true,
      dataProcessed: true
    }
    
  } catch (error) {
    console.error('保存结果页面分析结果失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 处理分析数据
function processAnalysisData(resultData) {
  const processed = { ...resultData }
  
  // 处理问题结果数据
  if (processed.questionResults && Array.isArray(processed.questionResults)) {
    processed.questionResults = processed.questionResults.map((question, qIndex) => {
      if (question.itemResults && Array.isArray(question.itemResults)) {
        question.itemResults = question.itemResults.map((item, iIndex) => {
          // 为每个项目添加索引
          item.itemIndex = iIndex + 1
          question.itemIndex = qIndex + 1
          
          // 格式化分析内容
          if (item.analysis) {
            item.formattedAnalysis = `${item.itemIndex}. ${item.analysis}`
          }
          
          return item
        })
        
        // 计算问题统计
        question.itemCount = question.itemResults.length
        question.correctItems = question.itemResults.filter(item => item.isCorrect).length
        question.accuracy = question.itemCount > 0 ? (question.correctItems / question.itemCount * 100).toFixed(2) : 0
      }
      return question
    })
  }
  
  // 计算总体统计
  if (processed.questionResults && processed.questionResults.length > 0) {
    const totalItems = processed.questionResults.reduce((sum, question) => {
      return sum + (question.itemResults ? question.itemResults.length : 0)
    }, 0)
    
    const correctItems = processed.questionResults.reduce((sum, question) => {
      if (question.itemResults) {
        return sum + question.itemResults.filter(item => item.isCorrect).length
      }
      return sum
    }, 0)
    
    processed.statistics = {
      ...processed.statistics,
      totalItems: totalItems,
      correctItems: correctItems,
      accuracy: totalItems > 0 ? (correctItems / totalItems * 100).toFixed(2) : 0,
      processedAt: new Date()
    }
  }
  
  return processed
}

// 根据时间合并分析结果
async function mergeAnalysisByTime(data) {
  try {
    const { 
      timeRange, 
      targetTime, 
      analysisField = 'analysis',
      outputCollection = 'merged_analysis_results'
    } = data
    
    console.log('开始根据时间合并分析结果...', { timeRange, targetTime, analysisField, outputCollection })
    
    let query = {}
    
    if (targetTime) {
      // 如果指定了具体时间，查找该时间点的记录
      query.createTime = targetTime
    } else if (timeRange) {
      // 如果指定了时间范围，查找该范围内的记录
      const { startTime, endTime } = timeRange
      if (startTime && endTime) {
        query.createTime = db.command.gte(startTime).and(db.command.lte(endTime))
      } else if (startTime) {
        query.createTime = db.command.gte(startTime)
      } else if (endTime) {
        query.createTime = db.command.lte(endTime)
      }
    } else {
      // 如果没有指定时间，获取最新的记录
      console.log('未指定时间，获取最新的分析结果记录...')
    }
    
    // 查询符合条件的记录
    let queryBuilder = db.collection('ai_analysis_results')
    
    if (Object.keys(query).length > 0) {
      queryBuilder = queryBuilder.where(query)
    }
    
    // 按时间排序
    const result = await queryBuilder
      .orderBy('createTime', 'asc')
      .get()
    
    if (!result.data || result.data.length === 0) {
      return {
        success: false,
        error: '没有找到符合条件的分析结果记录'
      }
    }
    
    console.log(`找到 ${result.data.length} 条符合条件的记录`)
    
    // 提取分析内容并合并
    const mergedAnalysis = []
    let recordCount = 0
    
    result.data.forEach((record, index) => {
      if (record[analysisField]) {
        recordCount++
        // 按照 1. analysis 2. analysis 的格式
        mergedAnalysis.push(`${recordCount}. ${record[analysisField]}`)
      }
    })
    
    if (mergedAnalysis.length === 0) {
      return {
        success: false,
        error: `没有找到包含 ${analysisField} 字段的记录`
      }
    }
    
    // 创建合并后的记录
    const mergedRecord = {
      originalRecordCount: result.data.length,
      analysisCount: mergedAnalysis.length,
      mergedAnalysis: mergedAnalysis,
      mergedText: mergedAnalysis.join('\n'), // 用换行符连接
      timeRange: {
        startTime: result.data[0].createTime,
        endTime: result.data[result.data.length - 1].createTime
      },
      originalRecordIds: result.data.map(r => r._id), // 保存原始记录ID
      createTime: new Date(),
      updateTime: new Date(),
      status: 'merged'
    }
    
    // 保存到指定集合
    const saveResult = await db.collection(outputCollection).add({
      data: mergedRecord
    })
    
    console.log('分析结果合并成功，保存到集合:', outputCollection)
    console.log('合并记录ID:', saveResult._id)
    console.log('合并的分析数量:', mergedAnalysis.length)
    
    return {
      success: true,
      recordId: saveResult._id,
      collectionName: outputCollection,
      mergedAnalysis: mergedAnalysis,
      mergedText: mergedRecord.mergedText,
      originalRecordCount: result.data.length,
      analysisCount: mergedAnalysis.length,
      message: '分析结果合并成功'
    }
    
  } catch (error) {
    console.error('合并分析结果失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 获取分析历史
async function getAnalysisHistory(data) {
  try {
    const { 
      userId, 
      limit = 20, 
      offset = 0,
      startDate,
      endDate
    } = data
    
    let query = {}
    
    // 如果指定了用户ID
    if (userId) {
      query.userId = userId
    }
    
    // 如果指定了日期范围
    if (startDate || endDate) {
      query.createTime = {}
      if (startDate) {
        query.createTime = db.command.gte(new Date(startDate))
      }
      if (endDate) {
        query.createTime = query.createTime ? 
          query.createTime.and(db.command.lte(new Date(endDate))) :
          db.command.lte(new Date(endDate))
      }
    }
    
    const result = await db.collection('ai_analysis_results')
      .where(query)
      .orderBy('createTime', 'desc')
      .skip(offset)
      .limit(limit)
      .get()
    
    return {
      success: true,
      data: result.data,
      total: result.data.length,
      hasMore: result.data.length === limit
    }
    
  } catch (error) {
    console.error('获取分析历史失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}
