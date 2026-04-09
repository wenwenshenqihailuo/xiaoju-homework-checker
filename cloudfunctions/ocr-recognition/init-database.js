// 数据库初始化脚本
// 用于创建 ocr_records 集合和设置权限

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 初始化数据库集合
async function initDatabase() {
  console.log('开始初始化OCR识别数据库...')
  
  const db = cloud.database()
  
  try {
    // 检查集合是否存在
    console.log('检查 ocr_records 集合是否存在...')
    
    // 尝试创建一个测试记录来检查集合是否存在
    const testRecord = {
      fileID: 'test-file-id',
      recognizedText: '测试记录',
      createTime: new Date(),
      updateTime: new Date(),
      status: 'test',
      confidence: 0.9,
      wordCount: 1,
      imageSize: 1024,
      ocrProvider: 'baidu',
      language: 'CHN_ENG'
    }
    
    const result = await db.collection('ocr_records').add({
      data: testRecord
    })
    
    console.log('✅ ocr_records 集合创建成功！')
    console.log('记录ID:', result._id)
    
    // 删除测试记录
    await db.collection('ocr_records').doc(result._id).remove()
    console.log('✅ 测试记录已清理')
    
    // 创建索引（如果支持的话）
    try {
      console.log('尝试创建索引...')
      // 注意：微信云开发可能不支持在云函数中直接创建索引
      // 索引需要在云开发控制台手动创建
      console.log('⚠️  索引需要在云开发控制台手动创建')
    } catch (indexError) {
      console.log('索引创建失败（这是正常的）:', indexError.message)
    }
    
    console.log('✅ 数据库初始化完成！')
    
    return {
      success: true,
      message: '数据库初始化成功',
      collectionName: 'ocr_records',
      recordId: result._id
    }
    
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
    
    // 如果是权限错误，提供解决方案
    if (error.message.includes('permission') || error.message.includes('权限')) {
      console.log('💡 解决方案：')
      console.log('1. 在云开发控制台创建 ocr_records 集合')
      console.log('2. 设置权限为"仅创建者可读写"')
      console.log('3. 重新运行此脚本')
    }
    
    return {
      success: false,
      error: error.message,
      message: '请手动在云开发控制台创建 ocr_records 集合'
    }
  }
}

// 创建示例记录
async function createSampleRecords() {
  console.log('创建示例记录...')
  
  const db = cloud.database()
  
  const sampleRecords = [
    {
      fileID: 'sample-1.jpg',
      recognizedText: '这是一个示例识别结果，包含中英文混合内容。This is a sample OCR result with mixed Chinese and English content.',
      createTime: new Date(),
      updateTime: new Date(),
      status: 'completed',
      confidence: 0.95,
      wordCount: 15,
      imageSize: 2048000,
      ocrProvider: 'baidu',
      language: 'CHN_ENG'
    },
    {
      fileID: 'sample-2.jpg',
      recognizedText: '',
      createTime: new Date(),
      updateTime: new Date(),
      status: 'failed',
      error: '图片格式不支持',
      errorCode: 'INVALID_INPUT',
      confidence: 0,
      wordCount: 0,
      imageSize: 0,
      ocrProvider: 'baidu',
      language: 'CHN_ENG'
    }
  ]
  
  try {
    for (let i = 0; i < sampleRecords.length; i++) {
      const result = await db.collection('ocr_records').add({
        data: sampleRecords[i]
      })
      console.log(`✅ 示例记录 ${i + 1} 创建成功，ID: ${result._id}`)
    }
    
    console.log('✅ 所有示例记录创建完成！')
    return { success: true, message: '示例记录创建成功' }
    
  } catch (error) {
    console.error('❌ 创建示例记录失败:', error)
    return { success: false, error: error.message }
  }
}

// 查询现有记录
async function queryRecords() {
  console.log('查询现有记录...')
  
  const db = cloud.database()
  
  try {
    const result = await db.collection('ocr_records')
      .orderBy('createTime', 'desc')
      .limit(10)
      .get()
    
    console.log(`✅ 查询到 ${result.data.length} 条记录`)
    
    result.data.forEach((record, index) => {
      console.log(`记录 ${index + 1}:`)
      console.log(`  ID: ${record._id}`)
      console.log(`  文件: ${record.fileID}`)
      console.log(`  状态: ${record.status}`)
      console.log(`  文本: ${record.recognizedText.substring(0, 50)}...`)
      console.log(`  时间: ${record.createTime}`)
      console.log('---')
    })
    
    return {
      success: true,
      count: result.data.length,
      records: result.data
    }
    
  } catch (error) {
    console.error('❌ 查询记录失败:', error)
    return { success: false, error: error.message }
  }
}

// 云函数入口
exports.main = async (event, context) => {
  const { action = 'init' } = event
  
  console.log('数据库初始化脚本启动，操作:', action)
  
  switch (action) {
    case 'init':
      return await initDatabase()
    case 'sample':
      return await createSampleRecords()
    case 'query':
      return await queryRecords()
    case 'all':
      const initResult = await initDatabase()
      if (initResult.success) {
        const sampleResult = await createSampleRecords()
        const queryResult = await queryRecords()
        return {
          init: initResult,
          sample: sampleResult,
          query: queryResult
        }
      }
      return initResult
    default:
      return {
        success: false,
        error: '未知操作',
        message: '支持的操作: init, sample, query, all'
      }
  }
}

// 本地测试
if (require.main === module) {
  initDatabase()
    .then(result => {
      console.log('初始化结果:', result)
      if (result.success) {
        return createSampleRecords()
      }
    })
    .then(result => {
      if (result) {
        console.log('示例记录结果:', result)
        return queryRecords()
      }
    })
    .then(result => {
      if (result) {
        console.log('查询结果:', result)
      }
      process.exit(0)
    })
    .catch(error => {
      console.error('脚本执行失败:', error)
      process.exit(1)
    })
}
