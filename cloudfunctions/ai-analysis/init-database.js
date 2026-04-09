// 数据库集合初始化脚本
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 创建必要的数据库集合
async function initDatabase() {
  console.log('开始初始化数据库集合...')
  
  try {
    // 1. 创建 segments 集合（存储分段数据）
    console.log('创建 segments 集合...')
    try {
      await db.createCollection('segments')
      console.log('segments 集合创建成功')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('segments 集合已存在')
      } else {
        console.error('创建 segments 集合失败:', error)
      }
    }

    // 2. 创建 ai_analysis_tasks 集合（存储任务信息）
    console.log('创建 ai_analysis_tasks 集合...')
    try {
      await db.createCollection('ai_analysis_tasks')
      console.log('ai_analysis_tasks 集合创建成功')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ai_analysis_tasks 集合已存在')
      } else {
        console.error('创建 ai_analysis_tasks 集合失败:', error)
      }
    }

    // 3. 创建 ai_analysis_results 集合（存储分析结果）
    console.log('创建 ai_analysis_results 集合...')
    try {
      await db.createCollection('ai_analysis_results')
      console.log('ai_analysis_results 集合创建成功')
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ai_analysis_results 集合已存在')
      } else {
        console.error('创建 ai_analysis_results 集合失败:', error)
      }
    }

    // 4. 创建索引（可选，提高查询性能）
    console.log('创建索引...')
    try {
      // 为 segments 集合创建索引
      await db.collection('segments').createIndex({
        data: {
          recordId: 1,
          segmentIndex: 1
        }
      })
      console.log('segments 集合索引创建成功')
    } catch (error) {
      console.log('创建索引失败（可能已存在）:', error.message)
    }

    try {
      // 为 ai_analysis_tasks 集合创建索引
      await db.collection('ai_analysis_tasks').createIndex({
        data: {
          taskId: 1
        }
      })
      console.log('ai_analysis_tasks 集合索引创建成功')
    } catch (error) {
      console.log('创建索引失败（可能已存在）:', error.message)
    }

    try {
      // 为 ai_analysis_results 集合创建索引
      await db.collection('ai_analysis_results').createIndex({
        data: {
          segmentId: 1,
          taskId: 1
        }
      })
      console.log('ai_analysis_results 集合索引创建成功')
    } catch (error) {
      console.log('创建索引失败（可能已存在）:', error.message)
    }

    console.log('数据库初始化完成！')
    return {
      success: true,
      message: '数据库集合初始化成功'
    }

  } catch (error) {
    console.error('数据库初始化失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 添加一些测试数据
async function addTestData() {
  console.log('添加测试数据...')
  
  try {
    // 添加测试分段数据
    const testSegments = [
      {
        recordId: 'test_record_1',
        segmentIndex: 0,
        text: 'hello world',
        createTime: new Date()
      },
      {
        recordId: 'test_record_1',
        segmentIndex: 1,
        text: 'good morning',
        createTime: new Date()
      },
      {
        recordId: 'test_record_1',
        segmentIndex: 2,
        text: 'thank you',
        createTime: new Date()
      },
      {
        recordId: 'test_record_1',
        segmentIndex: 3,
        text: 'see you later',
        createTime: new Date()
      },
      {
        recordId: 'test_record_1',
        segmentIndex: 4,
        text: 'how are you',
        createTime: new Date()
      }
    ]

    for (const segment of testSegments) {
      try {
        await db.collection('segments').add({
          data: segment
        })
        console.log(`测试分段添加成功: ${segment.text}`)
      } catch (error) {
        if (error.message.includes('duplicate')) {
          console.log(`测试分段已存在: ${segment.text}`)
        } else {
          console.error(`添加测试分段失败: ${segment.text}`, error)
        }
      }
    }

    console.log('测试数据添加完成')
    return {
      success: true,
      message: '测试数据添加成功'
    }

  } catch (error) {
    console.error('添加测试数据失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 主函数
async function main() {
  console.log('=== 数据库初始化脚本开始 ===')
  
  // 初始化数据库集合
  const initResult = await initDatabase()
  if (!initResult.success) {
    console.error('数据库初始化失败，停止执行')
    return
  }
  
  // 添加测试数据
  const testDataResult = await addTestData()
  if (!testDataResult.success) {
    console.error('测试数据添加失败')
  }
  
  console.log('=== 数据库初始化脚本完成 ===')
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error)
}

module.exports = {
  initDatabase,
  addTestData,
  main
}

