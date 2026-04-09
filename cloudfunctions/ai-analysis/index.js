// AI分析云函数
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 配置axios默认设置（在API_CONFIG定义后设置）
axios.defaults.maxRedirects = 5
axios.defaults.validateStatus = function (status) {
  return status >= 200 && status < 300
}

// 添加请求拦截器
axios.interceptors.request.use(function (config) {
  console.log(`发送请求到: ${config.url}`)
  return config
}, function (error) {
  console.error('请求拦截器错误:', error)
  return Promise.reject(error)
})

// 添加响应拦截器
axios.interceptors.response.use(function (response) {
  console.log(`收到响应: ${response.status}`)
  return response
}, function (error) {
  console.error('响应拦截器错误:', error.message)
  return Promise.reject(error)
})

// DeepSeek API配置
const DEEPSEEK_API_KEY = 'sk-d52f5f18ac8840c59083f53db4ea7be1' // 请替换为你的DeepSeek API Key
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'

// 任务配置
const TASK_CONFIG = {
  MAX_EXECUTION_TIME: 50000, // 50秒后自调用，留10秒缓冲
  BATCH_SIZE: 3, // 每批处理3个分段，提高成功率
  DELAY_BETWEEN_CALLS: 2000, // 自调用间隔2秒，提高响应速度
  DELAY_BETWEEN_ITEMS: 1000, // 每个分段之间的延迟
  DELAY_BETWEEN_BATCHES: 5000 // 批次之间的延迟
}

// API配置
const API_CONFIG = {
  TIMEOUT: 45000, // 减少API超时到45秒，为自调用留更多时间
  MAX_RETRIES: 2, // 最大重试次数
  RETRY_DELAY: 1000 // 重试延迟
}

// 配置axios默认设置
axios.defaults.timeout = API_CONFIG.TIMEOUT

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('AI分析云函数被调用，参数：', event);
  
  try {
    const { 
      isStartNewTask, 
      isGetPartialResults, 
      isGetFinalResults,
      taskId,
      isContinueTask, // 新增：继续处理下一批
      currentBatch, // 新增：当前批次号
      isClearDatabase // 新增：清除数据库
    } = event;

    // 清除数据库
    if (isClearDatabase) {
      const clearScript = require('./clear-database.js')
      return await clearScript.main(event, context)
    }

    // 开始新任务
    if (isStartNewTask) {
      return await startNewTask();
    }
    
    // 继续处理下一批
    if (isContinueTask) {
      return await continueTask(taskId, currentBatch);
    }
    
    // 获取部分结果（保留原有功能）
    if (isGetPartialResults) {
      return await getPartialResults(taskId);
    }
    
    // 获取最终结果（保留原有功能）
    if (isGetFinalResults) {
      return await getFinalResults(taskId);
    }

    return {
      success: false,
      error: '无效的操作类型'
    };

  } catch (error) {
    console.error('AI分析云函数执行错误：', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// 开始新任务
async function startNewTask() {
  try {
    console.log('开始新的AI分析任务');
    
    // 获取待分析的分段数据
    const segments = await getSegmentsToAnalyze();
    if (!segments || segments.length === 0) {
      return {
        success: false,
        error: '没有找到需要分析的分段数据'
      };
    }

    // 创建任务记录
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const taskRecord = {
      taskId,
      status: 'processing',
      totalRecords: segments.length,
      processedRecords: 0,
      failedRecords: 0,
      currentBatch: 0,
      totalBatches: Math.ceil(segments.length / TASK_CONFIG.BATCH_SIZE),
      allAnalysisResults: [],
      createTime: new Date(),
      updateTime: new Date(),
      error: null
    };

    // 保存任务记录到数据库
    await saveTaskRecord(taskRecord);

    // 处理第一批
    const firstBatchResult = await processBatch(segments, 0, taskId);
    
    // 更新任务记录
    const updatedTaskRecord = {
      ...taskRecord,
      processedRecords: firstBatchResult.processedCount,
      failedRecords: firstBatchResult.failedCount,
      currentBatch: 1,
      allAnalysisResults: firstBatchResult.results,
      updateTime: new Date()
    };
    await updateTaskRecord(taskId, updatedTaskRecord);

    return {
      success: true,
      taskId,
      hasMore: segments.length > TASK_CONFIG.BATCH_SIZE, // 是否还有更多批次
      currentBatch: 1,
      totalBatches: Math.ceil(segments.length / TASK_CONFIG.BATCH_SIZE),
      processedCount: firstBatchResult.processedCount,
      totalCount: segments.length,
      results: firstBatchResult.results,
      message: `已处理第1批，共${segments.length}个分段，还有${Math.max(0, segments.length - TASK_CONFIG.BATCH_SIZE)}个待处理`
    };

  } catch (error) {
    console.error('开始新任务失败：', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 继续处理下一批
async function continueTask(taskId, currentBatch) {
  try {
    console.log(`继续处理任务 ${taskId} 的第 ${currentBatch} 批`);
    
    // 获取任务记录
    const taskRecord = await getTaskRecord(taskId);
    if (!taskRecord) {
      return {
        success: false,
        error: '任务记录不存在'
      };
    }

    if (taskRecord.status === 'completed') {
      return {
        success: true,
        taskId,
        hasMore: false,
        currentBatch: taskRecord.currentBatch,
        totalBatches: taskRecord.totalBatches,
        processedCount: taskRecord.processedRecords,
        totalCount: taskRecord.totalRecords,
        results: taskRecord.allAnalysisResults,
        message: '任务已完成'
      };
    }

    // 获取待分析的分段数据
    const segments = await getSegmentsToAnalyze();
    if (!segments || segments.length === 0) {
      return {
        success: false,
        error: '没有找到需要分析的分段数据'
      };
    }

    // 计算当前批次的起始索引
    const startIndex = currentBatch * TASK_CONFIG.BATCH_SIZE;
    if (startIndex >= segments.length) {
      // 所有批次都处理完了
      const finalTaskRecord = {
        ...taskRecord,
        status: 'completed',
        processedRecords: taskRecord.totalRecords,
        currentBatch: taskRecord.totalBatches,
        updateTime: new Date()
      };
      await updateTaskRecord(taskId, finalTaskRecord);

      return {
        success: true,
        taskId,
        hasMore: false,
        currentBatch: taskRecord.totalBatches,
        totalBatches: taskRecord.totalBatches,
        processedCount: taskRecord.totalRecords,
        totalCount: taskRecord.totalRecords,
        results: taskRecord.allAnalysisResults,
        message: '所有批次处理完成'
      };
    }

    // 处理当前批次
    const batchResult = await processBatch(segments, startIndex, taskId);
    
    // 合并结果
    const allResults = [...taskRecord.allAnalysisResults, ...batchResult.results];
    
    // 计算累计处理数量
    const totalProcessed = taskRecord.processedRecords + batchResult.processedCount;
    const totalFailed = taskRecord.failedRecords + batchResult.failedCount;
    
    // 更新任务记录
    const updatedTaskRecord = {
      ...taskRecord,
      processedRecords: totalProcessed,
      failedRecords: totalFailed,
      currentBatch: currentBatch + 1,
      allAnalysisResults: allResults,
      updateTime: new Date()
    };

    // 检查是否还有更多批次
    const hasMore = (currentBatch + 1) * TASK_CONFIG.BATCH_SIZE < segments.length;
    
    if (!hasMore) {
      updatedTaskRecord.status = 'completed';
    }

    await updateTaskRecord(taskId, updatedTaskRecord);

    return {
      success: true,
      taskId,
      hasMore,
      currentBatch: currentBatch + 1,
      totalBatches: taskRecord.totalBatches,
      processedCount: totalProcessed, // 使用累计值
      totalCount: taskRecord.totalRecords,
      results: batchResult.results, // 只返回当前批次的结果
      allResults, // 返回所有已处理的结果
      message: hasMore 
        ? `已处理第${currentBatch + 1}批，还有${segments.length - (currentBatch + 1) * TASK_CONFIG.BATCH_SIZE}个待处理`
        : '所有批次处理完成'
    };

  } catch (error) {
    console.error('继续任务失败：', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 处理一批分段
async function processBatch(segments, startIndex, taskId) {
  const batchSegments = segments.slice(startIndex, startIndex + TASK_CONFIG.BATCH_SIZE);
  const results = [];
  let processedCount = 0;
  let failedCount = 0;

  console.log(`开始处理批次，起始索引：${startIndex}，分段数量：${batchSegments.length}`);

  for (let i = 0; i < batchSegments.length; i++) {
    try {
      const segment = batchSegments[i];
      console.log(`处理分段 ${startIndex + i + 1}/${segments.length}: ${segment.originalItem.substring(0, 50)}...`);

      // 调用AI分析
      const analysisResult = await analyzeSegment(segment);
      
      // 保存分析结果
      const resultRecord = {
        segmentId: segment.segmentId,
        originalItem: segment.originalItem,
        analysis: analysisResult,
        isCompleted: true,
        createTime: new Date()
      };
      
      await saveAnalysisResult(resultRecord);
      results.push(resultRecord);
      processedCount++;

      // 项目间延迟
      if (i < batchSegments.length - 1) {
        await sleep(TASK_CONFIG.DELAY_BETWEEN_ITEMS);
      }

    } catch (error) {
      console.error(`处理分段失败：`, error);
      failedCount++;
      
      // 记录失败的分段
      const errorRecord = {
        segmentId: batchSegments[i].segmentId,
        originalItem: batchSegments[i].originalItem,
        error: error.message,
        isCompleted: false,
        createTime: new Date()
      };
      
      await saveAnalysisResult(errorRecord);
      results.push(errorRecord);
    }
  }

  console.log(`批次处理完成，成功：${processedCount}，失败：${failedCount}`);

  return {
    results,
    processedCount,
    failedCount
  };
}

// 完成任务
async function finalizeTask(taskRecord) {
  console.log('所有任务处理完成，开始保存结果...')
  
  // 保存所有分析结果到数据库
  const analysisRecord = await saveAllAnalysisResults(taskRecord.allAnalysisResults)
  
  // 更新任务状态为完成
  taskRecord.status = 'completed'
  taskRecord.updateTime = new Date()
  await updateTaskRecord(taskRecord.taskId, taskRecord)
  
  console.log('所有分析结果已保存到数据库:', analysisRecord._id)
  
  return {
    success: true,
    data: {
      taskId: taskRecord.taskId,
      totalRecords: taskRecord.totalRecords,
      analysisRecordId: analysisRecord._id,
      allAnalysis: taskRecord.allAnalysisResults,
      totalItems: taskRecord.allAnalysisResults.reduce((sum, record) => sum + record.itemCount, 0)
    }
  }
}

// 查询任务状态
async function queryTaskStatus(event) {
  console.log('查询任务状态...', event.taskId)
  
  try {
    const taskRecord = await getTaskRecord(event.taskId)
    if (!taskRecord) {
      return {
        success: false,
        error: '任务不存在'
      }
    }
    
    // 计算进度
    const progress = {
      taskId: taskRecord.taskId,
      status: taskRecord.status,
      totalRecords: taskRecord.totalRecords,
      processedRecords: taskRecord.processedRecords,
      currentRecordIndex: taskRecord.currentRecordIndex,
      currentSegmentIndex: taskRecord.currentSegmentIndex,
      progress: taskRecord.totalRecords > 0 ? Math.round((taskRecord.processedRecords / taskRecord.totalRecords) * 100) : 0,
      createTime: taskRecord.createTime,
      updateTime: taskRecord.updateTime,
      error: taskRecord.error || null
    }
    
    return {
      success: true,
      data: progress
    }
    
  } catch (error) {
    console.error('查询任务状态失败:', error)
    return {
      success: false,
      error: '查询任务状态失败'
    }
  }
}

// 恢复失败任务
async function resumeFailedTask(event) {
  console.log('恢复失败任务...', event.taskId)
  
  try {
    const taskRecord = await getTaskRecord(event.taskId)
    if (!taskRecord) {
      return {
        success: false,
        error: '任务不存在'
      }
    }
    
    if (taskRecord.status !== 'failed') {
      return {
        success: false,
        error: '任务状态不是失败状态，无法恢复'
      }
    }
    
    // 重置任务状态
    taskRecord.status = 'processing'
    taskRecord.error = null
    taskRecord.updateTime = new Date()
    
    await updateTaskRecord(taskRecord.taskId, taskRecord)
    
    // 获取所有分段记录
    const allSegmentRecords = await getAllSegmentRecords()
    
    // 继续处理任务
    return await processNextBatch(taskRecord, allSegmentRecords)
    
  } catch (error) {
    console.error('恢复失败任务失败:', error)
    return {
      success: false,
      error: '恢复失败任务失败'
    }
  }
}

// 恢复中断任务（超时或自调用失败）
async function resumeInterruptedTask(event) {
  console.log('恢复中断任务...', event.taskId)
  
  try {
    const taskRecord = await getTaskRecord(event.taskId)
    if (!taskRecord) {
      return {
        success: false,
        error: '任务不存在'
      }
    }
    
    if (taskRecord.status !== 'processing') {
      return {
        success: false,
        error: '任务状态不是处理中状态'
      }
    }
    
    // 检查是否有未完成的部分结果
    const hasPartialResults = taskRecord.allAnalysisResults.some(result => 
      result.analysis === null && result.partialResults
    )
    
    if (!hasPartialResults) {
      return {
        success: false,
        error: '没有找到可恢复的部分结果'
      }
    }
    
    console.log('找到部分结果，继续处理...')
    
    // 获取所有分段记录
    const allSegmentRecords = await getAllSegmentRecords()
    
    // 继续处理任务
    return await processNextBatch(taskRecord, allSegmentRecords)
    
  } catch (error) {
    console.error('恢复中断任务失败:', error)
    return {
      success: false,
      error: '恢复任务失败: ' + error.message
    }
  }
}

// 自调用处理
async function handleSelfCall(event) {
  console.log('收到自调用请求，延迟后继续...')
  
  // 延迟一段时间
  await sleep(TASK_CONFIG.DELAY_BETWEEN_CALLS)
  
  // 继续任务
  return await continueTask(event.taskId, event.currentBatch);
}

// 调度自调用（带重试机制）
async function scheduleSelfCall(taskRecord) {
  const maxRetries = 5
  let lastError = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`调度自调用... (尝试 ${attempt}/${maxRetries})`)
      
      // 等待一段时间再调用，避免频率过高
      await new Promise(resolve => setTimeout(resolve, TASK_CONFIG.DELAY_BETWEEN_CALLS))
      
      // 使用云函数自调用，增加超时时间
      const result = await cloud.callFunction({
        name: 'ai-analysis',
        data: {
          isContinueTask: true,
          taskId: taskRecord.taskId,
          retryCount: attempt
        },
        config: {
          timeout: 120000 // 增加超时时间到120秒
        }
      })
      
      console.log('自调用成功:', result)
      return {
        success: true,
        data: {
          message: '任务已调度继续执行',
          taskId: taskRecord.taskId,
          status: 'processing',
          retryCount: attempt
        }
      }
      
    } catch (error) {
      lastError = error
      console.error(`自调用失败 (尝试 ${attempt}/${maxRetries}):`, error.message)
      
      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        const retryDelay = TASK_CONFIG.DELAY_BETWEEN_CALLS * (attempt + 1) // 递增延迟
        console.log(`等待 ${retryDelay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }
  
  // 所有重试都失败了，尝试保存当前进度
  console.error('自调用最终失败，尝试保存当前进度')
  try {
    taskRecord.status = 'failed'
    taskRecord.error = '自调用失败'
    taskRecord.updateTime = new Date()
    await updateTaskRecord(taskRecord.taskId, taskRecord)
    
    return {
      success: false,
      error: '自调用失败，任务已暂停',
      taskId: taskRecord.taskId,
      status: 'failed'
    }
  } catch (saveError) {
    console.error('保存失败状态也失败了:', saveError)
    throw lastError
  }
}

// 生成任务ID
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 获取待分析的分段数据
async function getSegmentsToAnalyze() {
  try {
    // 从数据库获取所有分段记录
    const allSegmentRecords = await getAllSegmentRecords();
    
    console.log('获取到的分段记录数量:', allSegmentRecords.length);
    if (allSegmentRecords.length > 0) {
      console.log('第一条记录结构:', JSON.stringify(allSegmentRecords[0], null, 2));
    }
    
    // 如果没有数据，返回测试数据
    if (!allSegmentRecords || allSegmentRecords.length === 0) {
      console.log('数据库中没有分段记录，使用测试数据');
      return [
        {
          segmentId: 'test_1',
          originalItem: 'hello world',
          recordId: 'test_record_1',
          segmentIndex: 0
        },
        {
          segmentId: 'test_2',
          originalItem: 'good morning',
          recordId: 'test_record_1',
          segmentIndex: 1
        },
        {
          segmentId: 'test_3',
          originalItem: 'thank you',
          recordId: 'test_record_1',
          segmentIndex: 2
        },
        {
          segmentId: 'test_4',
          originalItem: 'see you later',
          recordId: 'test_record_1',
          segmentIndex: 3
        },
        {
          segmentId: 'test_5',
          originalItem: 'how are you',
          recordId: 'test_record_1',
          segmentIndex: 4
        }
      ];
    }

    // 转换为分段数组
    const segments = [];
    allSegmentRecords.forEach(record => {
      if (record.segments && Array.isArray(record.segments)) {
        record.segments.forEach((segment, index) => {
          segments.push({
            segmentId: `${record._id}_${index}`,
            originalItem: segment.text || segment.originalItem || segment.original || segment,
            recordId: record._id,
            segmentIndex: index
          });
        });
      }
    });

    console.log(`获取到 ${segments.length} 个待分析分段`);
    return segments;

  } catch (error) {
    console.error('获取待分析分段失败：', error);
    // 返回测试数据作为备选
    console.log('使用测试数据作为备选');
    return [
      {
        segmentId: 'test_1',
        originalItem: 'hello world',
        recordId: 'test_record_1',
        segmentIndex: 0
      },
      {
        segmentId: 'test_2',
        originalItem: 'good morning',
        recordId: 'test_record_1',
        segmentIndex: 1
      }
    ];
  }
}

// 分析单个分段
async function analyzeSegment(segment) {
  try {
    console.log(`开始分析分段：${segment.originalItem.substring(0, 50)}...`);
    
    // 调用AI分析API
    const analysisResult = await callAIAnalysis(segment.originalItem);
    
    return analysisResult;

  } catch (error) {
    console.error('AI分析失败：', error);
    throw error;
  }
}

// 调用AI分析API
async function callAIAnalysis(text) {
  try {
    // 使用已有的AI分析逻辑
    const segment = {
      text: text,
      id: 'temp_' + Date.now()
    };
    
    const result = await analyzeSingleSegment(segment, 1, 1);
    
    return result;

  } catch (error) {
    console.error('调用AI分析API失败：', error);
    throw error;
  }
}

// 保存分析结果
async function saveAnalysisResult(result) {
  try {
    await db.collection('ai_analysis_results').add({
      data: result
    });
    console.log(`分析结果已保存：${result.segmentId}`);
  } catch (error) {
    console.error('保存分析结果失败：', error);
    throw error;
  }
}

// 保存任务记录
async function saveTaskRecord(taskRecord) {
  try {
    await db.collection('ai_analysis_tasks').add({
      data: taskRecord
    });
    console.log(`任务记录已保存：${taskRecord.taskId}`);
  } catch (error) {
    console.error('保存任务记录失败：', error);
    throw error;
  }
}

// 获取任务记录
async function getTaskRecord(taskId) {
  try {
    const result = await db.collection('ai_analysis_tasks')
      .where({
        taskId: taskId
      })
      .get();
    
    if (result.data && result.data.length > 0) {
      return result.data[0];
    }
    return null;
  } catch (error) {
    console.error('获取任务记录失败：', error);
    throw error;
  }
}

// 更新任务记录
async function updateTaskRecord(taskId, taskRecord) {
  try {
    // 移除 _id 字段，避免更新错误
    const { _id, ...updateData } = taskRecord;
    
    await db.collection('ai_analysis_tasks')
      .where({
        taskId: taskId
      })
      .update({
        data: updateData
      });
    console.log(`任务记录已更新：${taskId}`);
  } catch (error) {
    console.error('更新任务记录失败：', error);
    throw error;
  }
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 睡眠函数（别名）
function sleep(ms) {
  return delay(ms);
}

// 获取所有分段记录
async function getAllSegmentRecords() {
  try {
    const result = await db.collection('segments')
      .orderBy('createTime', 'desc')
      .get()
    
    return result.data || []
  } catch (error) {
    console.error('获取所有分段记录失败:', error)
    throw error
  }
}

// 分析单个分段（带重试机制）
async function analyzeSingleSegment(segment, segmentIndex, totalSegments) {
  let lastError = null
  
  for (let attempt = 1; attempt <= API_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const prompt = buildSegmentAnalysisPrompt(segment, segmentIndex, totalSegments)
      
      console.log(`调用DeepSeek API分析第 ${segmentIndex} 个分段... (尝试 ${attempt}/${API_CONFIG.MAX_RETRIES})`)
      
      const response = await axios.post(DEEPSEEK_API_URL, {
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 1024,
        top_p: 0.95
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        timeout: API_CONFIG.TIMEOUT,
        // 添加连接配置
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 300
        }
      })
      
      const aiResponse = response.data.choices[0].message.content
      console.log(`第 ${segmentIndex} 个分段分析完成`)
      
      return parseSegmentResponse(aiResponse, segment, segmentIndex)
      
    } catch (error) {
      lastError = error
      console.error(`第 ${segmentIndex} 个分段分析失败 (尝试 ${attempt}/${API_CONFIG.MAX_RETRIES}):`, error.message)
      
      // 如果不是最后一次尝试，等待后重试
      if (attempt < API_CONFIG.MAX_RETRIES) {
        console.log(`等待 ${API_CONFIG.RETRY_DELAY}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY))
      }
    }
  }
  
  // 所有重试都失败了，返回默认结果
  console.log(`第 ${segmentIndex} 个分段分析失败，使用默认结果`)
  return createDefaultSegmentResult(segment, segmentIndex)
}

// 构建分段分析提示词
function buildSegmentAnalysisPrompt(segment, segmentIndex, totalSegments) {
  return `你是一个专业的英语老师和拼写检查专家。现在需要分析一个英语单词或短语（第 ${segmentIndex}/${totalSegments} 个分段）。

请仔细分析这个分段，并严格按照以下JSON格式返回结果：

{
  "isCorrect": true/false,
  "analysis": "这个单词/短语的简单分析在20个字之内",
  "correctAnswer": "正确的拼写或表达",
  "suggestion": "改进建议在20个字之内",
  "confidence": 0.0-1.0
}

分析要求：
1. 仔细检查单词的拼写是否正确
2. 如果是短语，检查语法和表达是否规范
3. 提供的纠正建议
4. 给出分析的可信度

待分析分段：${segment.text} (编号: ${segment.id})

请开始分析：`
}

// 解析分段分析结果
function parseSegmentResponse(aiResponse, segment, segmentIndex) {
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const jsonStr = jsonMatch[0]
      const parsed = JSON.parse(jsonStr)
      
      return {
        isCorrect: typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : true,
        analysis: parsed.analysis || '',
        correctAnswer: parsed.correctAnswer || segment.text,
        suggestion: parsed.suggestion || '',
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.8,
        spellingErrors: [], // 前端期望的字段
        grammarErrors: [],  // 前端期望的字段
        itemAnalyses: []    // 前端期望的字段
      }
    }
  } catch (error) {
    console.error('分段JSON解析失败:', error)
  }
  
  return createDefaultSegmentResult(segment, segmentIndex)
}

// 创建默认分段结果
function createDefaultSegmentResult(segment, segmentIndex) {
  return {
    isCorrect: true,
    analysis: '无法分析此分段',
    correctAnswer: segment.text,
    suggestion: '请手动检查',
    confidence: 0.5,
    spellingErrors: [],
    grammarErrors: [],
    itemAnalyses: []
  }
}

// 合并所有分析结果
function combineAllResults(analysisResults, segments) {
  // 统计信息
  const totalItems = analysisResults.length
  const correctItems = analysisResults.filter(result => result.isCorrect).length
  const incorrectItems = totalItems - correctItems
  
  // 收集所有分析
  const allAnalyses = []
  let totalConfidence = 0
  
  analysisResults.forEach((result, index) => {
    allAnalyses.push(`第${result.itemIndex}项: ${result.analysis}`)
    totalConfidence += result.confidence
  })
  
  // 计算平均置信度
  const averageConfidence = totalItems > 0 ? totalConfidence / totalItems : 0.8
  
  // 生成整体分析
  const overallAnalysis = generateOverallAnalysis(analysisResults, totalItems, correctItems)
  
  // 计算整体评分
  const score = calculateOverallScore(analysisResults, averageConfidence)
  
  // 生成建议答案
  const correctAnswer = generateCorrectAnswer(analysisResults)
  
  // 生成改进建议
  const suggestion = generateSuggestion(analysisResults)
  
  return {
    isCorrect: incorrectItems === 0,
    score: score,
    analysis: overallAnalysis,
    correctAnswer: correctAnswer,
    suggestion: suggestion,
    confidence: averageConfidence,
    itemAnalyses: allAnalyses,
    itemResults: analysisResults,
    statistics: {
      totalItems: totalItems,
      correctItems: correctItems,
      incorrectItems: incorrectItems,
      accuracy: totalItems > 0 ? (correctItems / totalItems * 100).toFixed(1) : 0
    }
  }
}

// 生成整体分析
function generateOverallAnalysis(analysisResults, totalItems, correctItems) {
  const accuracy = totalItems > 0 ? (correctItems / totalItems * 100).toFixed(1) : 0
  
  if (correctItems === totalItems) {
    return `分析完成！所有 ${totalItems} 个项目都正确，准确率 100%。表现优秀！`
  } else if (correctItems >= totalItems * 0.8) {
    return `分析完成！${correctItems}/${totalItems} 个项目正确，准确率 ${accuracy}%。表现良好，需要继续改进。`
  } else if (correctItems >= totalItems * 0.6) {
    return `分析完成！${correctItems}/${totalItems} 个项目正确，准确率 ${accuracy}%。表现一般，需要更多练习。`
  } else {
    return `分析完成！${correctItems}/${totalItems} 个项目正确，准确率 ${accuracy}%。需要重新学习，建议多加练习。`
  }
}

// 计算整体评分
function calculateOverallScore(analysisResults, confidence) {
  const totalItems = analysisResults.length
  if (totalItems === 0) return 0
  
  const correctItems = analysisResults.filter(result => result.isCorrect).length
  const accuracy = correctItems / totalItems
  
  // 基础分数基于准确率
  let baseScore = accuracy * 100
  
  // 根据置信度调整分数
  const confidenceBonus = confidence * 10
  
  // 根据错误数量调整分数
  const errorPenalty = analysisResults.filter(result => !result.isCorrect).length * 5
  
  const finalScore = Math.max(0, Math.min(100, baseScore + confidenceBonus - errorPenalty))
  
  return Math.round(finalScore)
}

// 生成建议答案
function generateCorrectAnswer(analysisResults) {
  return analysisResults.map(result => {
    if (result.isCorrect) {
      return `${result.id}.${result.text}`
    } else {
      return `${result.id}.${result.correctAnswer}`
    }
  }).join('\n')
}

// 生成改进建议
function generateSuggestion(analysisResults) {
  const suggestions = []
  
  // 统计错误类型
  const incorrectItems = analysisResults.filter(result => !result.isCorrect)
  
  if (incorrectItems.length > 0) {
    suggestions.push(`需要改进的项目：${incorrectItems.map(item => item.itemIndex).join('、')}号`)
  }
  
  if (suggestions.length === 0) {
    return '继续保持，所有项目都正确！'
  }
  
  return suggestions.join('；') + '。建议仔细检查并多加练习。'
}

// 延迟函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 保存所有分析结果到数据库
async function saveAllAnalysisResults(allAnalysisResults) {
  try {
    console.log('保存所有分析结果到数据库...')
    
    const analysisRecord = {
      allAnalysis: allAnalysisResults,
      totalRecords: allAnalysisResults.length,
      totalItems: allAnalysisResults.reduce((sum, record) => sum + record.itemCount, 0),
      createTime: new Date(),
      updateTime: new Date(),
      status: 'completed'
    }
    
    const result = await db.collection('ai_analysis_results').add({
      data: analysisRecord
    })
    
    console.log('所有分析结果保存成功，ID:', result._id)
    return { _id: result._id }
    
  } catch (error) {
    console.error('保存所有分析结果失败:', error)
    // 不抛出错误，因为分析本身是成功的
    return { _id: null }
  }
}

// 处理第一批（立即返回结果）
async function processFirstBatch(taskRecord, allSegmentRecords) {
  console.log('处理第一批分段...')
  
  try {
    const batchSize = Math.min(TASK_CONFIG.BATCH_SIZE, allSegmentRecords.length)
    const firstBatch = allSegmentRecords.slice(0, batchSize)
    
    console.log(`第一批包含 ${firstBatch.length} 个分段`)
    
    // 分析第一批
    const batchResults = []
    for (let i = 0; i < firstBatch.length; i++) {
      const segment = firstBatch[i]
      console.log(`分析第 ${i + 1}/${firstBatch.length} 个分段: ${segment.originalItem}`)
      
      try {
        const analysisResult = await analyzeSegment(segment)
        
        // 保存分析结果
        const resultRecord = {
          segmentId: segment._id,
          originalItem: segment.originalItem,
          analysis: analysisResult,
          partialResults: null, // 第一批不需要部分结果
          isCompleted: true,
          createTime: new Date()
        }
        
        batchResults.push(resultRecord)
        
        // 更新任务记录
        taskRecord.processedRecords++
        taskRecord.allAnalysisResults.push(resultRecord)
        
        console.log(`✅ 第 ${i + 1} 个分段分析完成`)
        
      } catch (error) {
        console.error(`❌ 第 ${i + 1} 个分段分析失败:`, error)
        
        // 记录失败的分段
        const failedRecord = {
          segmentId: segment._id,
          originalItem: segment.originalItem,
          analysis: null,
          partialResults: null,
          isCompleted: false,
          error: error.message,
          createTime: new Date()
        }
        
        batchResults.push(failedRecord)
        taskRecord.failedRecords++
        taskRecord.allAnalysisResults.push(failedRecord)
      }
      
      // 短暂延迟，避免API频率限制
      if (i < firstBatch.length - 1) {
        await sleep(TASK_CONFIG.DELAY_BETWEEN_ITEMS)
      }
    }
    
    // 更新任务记录
    taskRecord.updateTime = new Date()
    await updateTaskRecord(taskRecord.taskId, taskRecord)
    
    // 如果还有未处理的分段，启动后台处理
    if (taskRecord.processedRecords < taskRecord.totalRecords) {
      console.log('启动后台处理剩余分段...')
      
      // 异步启动后台处理（不等待结果）
      processRemainingSegments(taskRecord, allSegmentRecords).catch(error => {
        console.error('后台处理失败:', error)
        // 更新任务状态为失败
        taskRecord.status = 'failed'
        taskRecord.error = '后台处理失败: ' + error.message
        taskRecord.updateTime = new Date()
        updateTaskRecord(taskRecord.taskId, taskRecord).catch(console.error)
      })
    } else {
      // 所有分段都处理完成
      taskRecord.status = 'completed'
      taskRecord.updateTime = new Date()
      await updateTaskRecord(taskRecord.taskId, taskRecord)
      console.log('✅ 所有分段处理完成')
    }
    
    return {
      success: true,
      data: {
        batchResults,
        processedCount: taskRecord.processedRecords,
        totalCount: taskRecord.totalRecords,
        hasMore: taskRecord.processedRecords < taskRecord.totalRecords
      }
    }
    
  } catch (error) {
    console.error('处理第一批失败:', error)
    return {
      success: false,
      error: '处理第一批失败: ' + error.message
    }
  }
}

// 后台处理剩余分段
async function processRemainingSegments(taskRecord, allSegmentRecords) {
  console.log('后台处理剩余分段...')
  
  try {
    const remainingSegments = allSegmentRecords.slice(taskRecord.processedRecords)
    console.log(`剩余 ${remainingSegments.length} 个分段待处理`)
    
    // 分批处理剩余分段
    for (let batchStart = 0; batchStart < remainingSegments.length; batchStart += TASK_CONFIG.BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + TASK_CONFIG.BATCH_SIZE, remainingSegments.length)
      const batch = remainingSegments.slice(batchStart, batchEnd)
      
      console.log(`处理批次 ${Math.floor(batchStart / TASK_CONFIG.BATCH_SIZE) + 1}: ${batch.length} 个分段`)
      
      // 处理当前批次
      for (let i = 0; i < batch.length; i++) {
        const segment = batch[i]
        const globalIndex = taskRecord.processedRecords + batchStart + i
        
        console.log(`分析第 ${globalIndex + 1}/${taskRecord.totalRecords} 个分段: ${segment.originalItem}`)
        
        try {
          const analysisResult = await analyzeSegment(segment)
          
          // 更新分析结果
          const resultRecord = {
            segmentId: segment._id,
            originalItem: segment.originalItem,
            analysis: analysisResult,
            partialResults: null,
            isCompleted: true,
            createTime: new Date()
          }
          
          // 更新任务记录
          taskRecord.processedRecords++
          taskRecord.allAnalysisResults.push(resultRecord)
          
          console.log(`✅ 第 ${globalIndex + 1} 个分段分析完成`)
          
        } catch (error) {
          console.error(`❌ 第 ${globalIndex + 1} 个分段分析失败:`, error)
          
          // 记录失败的分段
          const failedRecord = {
            segmentId: segment._id,
            originalItem: segment.originalItem,
            analysis: null,
            partialResults: null,
            isCompleted: false,
            error: error.message,
            createTime: new Date()
          }
          
          taskRecord.failedRecords++
          taskRecord.allAnalysisResults.push(failedRecord)
        }
        
        // 短暂延迟
        if (i < batch.length - 1) {
          await sleep(TASK_CONFIG.DELAY_BETWEEN_ITEMS)
        }
      }
      
      // 更新任务记录
      taskRecord.updateTime = new Date()
      await updateTaskRecord(taskRecord.taskId, taskRecord)
      
      // 批次间延迟
      if (batchEnd < remainingSegments.length) {
        await sleep(TASK_CONFIG.DELAY_BETWEEN_BATCHES)
      }
    }
    
    // 所有分段处理完成
    taskRecord.status = 'completed'
    taskRecord.updateTime = new Date()
    await updateTaskRecord(taskRecord.taskId, taskRecord)
    
    console.log('✅ 后台处理完成，所有分段已分析完毕')
    
  } catch (error) {
    console.error('后台处理失败:', error)
    throw error
  }
}

// 获取部分结果
async function getPartialResults(taskId) {
  console.log('获取部分结果...', taskId)
  
  try {
    const taskRecord = await getTaskRecord(taskId)
    if (!taskRecord) {
      return {
        success: false,
        error: '任务不存在'
      }
    }
    
    // 返回已完成的分析结果
    const completedResults = taskRecord.allAnalysisResults.filter(result => result.isCompleted)
    
    return {
      success: true,
      data: {
        taskId: taskRecord.taskId,
        status: taskRecord.status,
        progress: {
          processed: taskRecord.processedRecords,
          total: taskRecord.totalRecords,
          percentage: Math.round((taskRecord.processedRecords / taskRecord.totalRecords) * 100)
        },
        results: completedResults,
        hasMore: taskRecord.status === 'processing',
        estimatedTime: estimateRemainingTime(taskRecord)
      }
    }
    
  } catch (error) {
    console.error('获取部分结果失败:', error)
    return {
      success: false,
      error: '获取部分结果失败: ' + error.message
    }
  }
}

// 获取最终结果
async function getFinalResults(taskId) {
  console.log('获取最终结果...', taskId)
  
  try {
    const taskRecord = await getTaskRecord(taskId)
    if (!taskRecord) {
      return {
        success: false,
        error: '任务不存在'
      }
    }
    
    if (taskRecord.status !== 'completed') {
      return {
        success: false,
        error: '任务尚未完成',
        data: {
          status: taskRecord.status,
          progress: {
            processed: taskRecord.processedRecords,
            total: taskRecord.totalRecords,
            percentage: Math.round((taskRecord.processedRecords / taskRecord.totalRecords) * 100)
          }
        }
      }
    }
    
    // 生成综合分析结果
    const finalAnalysis = generateFinalAnalysis(taskRecord.allAnalysisResults)
    
    return {
      success: true,
      data: {
        taskId: taskRecord.taskId,
        status: 'completed',
        finalAnalysis,
        allResults: taskRecord.allAnalysisResults,
        statistics: {
          total: taskRecord.totalRecords,
          processed: taskRecord.processedRecords,
          failed: taskRecord.failedRecords,
          successRate: Math.round(((taskRecord.totalRecords - taskRecord.failedRecords) / taskRecord.totalRecords) * 100)
        }
      }
    }
    
  } catch (error) {
    console.error('获取最终结果失败:', error)
    return {
      success: false,
      error: '获取最终结果失败: ' + error.message
    }
  }
}

// 生成综合分析结果
function generateFinalAnalysis(allResults) {
  const completedResults = allResults.filter(result => result.isCompleted && result.analysis)
  const failedResults = allResults.filter(result => !result.isCompleted)
  
  if (completedResults.length === 0) {
    return {
      score: 0,
      isCorrect: false,
      analysis: '没有成功分析的结果',
      correctAnswer: '',
      suggestion: '请检查输入内容或重新尝试',
      spellingErrors: [],
      grammarErrors: [],
      wordSuggestions: {},
      itemAnalyses: [],
      itemResults: []
    }
  }
  
  // 计算总体评分
  const totalScore = completedResults.reduce((sum, result) => {
    return sum + (result.analysis.score || 0)
  }, 0)
  const averageScore = Math.round(totalScore / completedResults.length)
  
  // 收集所有错误和建议
  const allSpellingErrors = []
  const allGrammarErrors = []
  const allWordSuggestions = {}
  const allItemAnalyses = []
  const allItemResults = []
  
  completedResults.forEach((result, index) => {
    if (result.analysis.spellingErrors) {
      allSpellingErrors.push(...result.analysis.spellingErrors)
    }
    if (result.analysis.grammarErrors) {
      allGrammarErrors.push(...result.analysis.grammarErrors)
    }
    if (result.analysis.wordSuggestions) {
      Object.assign(allWordSuggestions, result.analysis.wordSuggestions)
    }
    if (result.analysis.analysis) {
      allItemAnalyses.push(`第${index + 1}项: ${result.analysis.analysis}`)
    }
    
    allItemResults.push({
      itemIndex: index + 1,
      originalItem: result.originalItem,
      isCorrect: result.analysis.isCorrect || false,
      analysis: result.analysis.analysis || '',
      suggestion: result.analysis.suggestion || '',
      score: result.analysis.score || 0
    })
  })
  
  return {
    score: averageScore,
    isCorrect: averageScore >= 80,
    analysis: `分析了 ${completedResults.length} 个项目，平均得分 ${averageScore} 分`,
    correctAnswer: '',
    suggestion: failedResults.length > 0 ? `有 ${failedResults.length} 个项目分析失败，建议重新检查` : '分析完成，请查看详细结果',
    spellingErrors: [...new Set(allSpellingErrors)],
    grammarErrors: [...new Set(allGrammarErrors)],
    wordSuggestions: allWordSuggestions,
    itemAnalyses: allItemAnalyses,
    itemResults: allItemResults
  }
}

// 估算剩余时间
function estimateRemainingTime(taskRecord) {
  if (taskRecord.processedRecords === 0) {
    return '计算中...'
  }
  
  const remainingRecords = taskRecord.totalRecords - taskRecord.processedRecords
  const estimatedSecondsPerRecord = 6 // 每个记录约6秒
  const estimatedSeconds = remainingRecords * estimatedSecondsPerRecord
  
  if (estimatedSeconds < 60) {
    return `约 ${estimatedSeconds} 秒`
  } else if (estimatedSeconds < 3600) {
    const minutes = Math.ceil(estimatedSeconds / 60)
    return `约 ${minutes} 分钟`
  } else {
    const hours = Math.ceil(estimatedSeconds / 3600)
    return `约 ${hours} 小时`
  }
}
