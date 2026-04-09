// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    console.log('=== 开始分段处理 ===')
    console.log('接收到的参数:', event)
    
    const { ocrRecordId, ocrResult } = event
    
    let segments = []
    let ocrRecordIdToUse = ocrRecordId
    
    // 如果传入了OCR结果，直接处理
    if (ocrResult && ocrResult.simpleFormat) {
      console.log('使用传入的OCR结果进行分段处理')
      segments = parseAndSegmentSimpleFormat(ocrResult.simpleFormat)
      ocrRecordIdToUse = ocrResult.recordId || 'temp_ocr_id'
    } else {
      // 从数据库获取OCR记录
      const ocrRecord = await getOCRRecord(ocrRecordId)
      if (!ocrRecord) {
        return {
          success: false,
          error: '没有找到OCR记录'
        }
      }
      
      console.log('获取到OCR记录:', ocrRecord._id)
      ocrRecordIdToUse = ocrRecord._id
      
      // 检查是否有simpleFormat数据
      if (ocrRecord.simpleFormat && Array.isArray(ocrRecord.simpleFormat)) {
        console.log('使用simpleFormat数据进行分段处理，共', ocrRecord.simpleFormat.length, '项')
        segments = parseAndSegmentSimpleFormat(ocrRecord.simpleFormat)
      } else if (ocrRecord.text) {
        console.log('使用text字段进行分段处理')
        segments = parseAndSegmentText(ocrRecord.text)
      } else {
        return {
          success: false,
          error: 'OCR记录中没有找到可处理的数据'
        }
      }
    }
    
    if (segments.length === 0) {
      return {
        success: false,
        error: '没有生成任何分段'
      }
    }
    
    console.log('分段处理完成，共', segments.length, '个分段')
    
    // 保存分段结果到数据库
    const segmentRecord = await saveSegmentRecord(ocrRecordIdToUse, segments)
    console.log('分段结果已保存到数据库:', segmentRecord._id)
    
    return {
      success: true,
      data: {
        segmentRecordId: segmentRecord._id,
        ocrRecordId: ocrRecordIdToUse,
        segments: segments,
        totalSegments: segments.length
      }
    }
    
  } catch (error) {
    console.error('分段处理失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// 获取指定的OCR记录
async function getOCRRecord(ocrRecordId) {
  try {
    if (ocrRecordId) {
      // 获取指定的OCR记录
      const result = await db.collection('ocr_records')
        .doc(ocrRecordId)
        .get()
      
      return result.data || null
    } else {
      // 如果没有指定ID，获取最新的OCR记录
      const result = await db.collection('ocr_records')
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()
      
      return result.data[0] || null
    }
  } catch (error) {
    console.error('获取OCR记录失败:', error)
    throw error
  }
}

// 解析和分段处理文本
function parseAndSegmentText(text) {
  const segments = []
  
  // 按行分割文本
  const lines = text.split('\n').filter(line => line.trim() !== '')
  
  lines.forEach((line, index) => {
    // 尝试匹配编号格式：1. 2. 3. 等
    const numberMatch = line.match(/^(\d+)\.\s*(.+)$/)
    
    if (numberMatch) {
      // 有编号的格式
      const number = parseInt(numberMatch[1])
      const content = numberMatch[2].trim()
      
      segments.push({
        id: number,
        text: content,
        createTime: new Date()
      })
    } else {
      // 没有编号的格式，使用行号
      const content = line.trim()
      if (content) {
        segments.push({
          id: index + 1,
          text: content,
          createTime: new Date()
        })
      }
    }
  })
  
  // 如果没有找到任何分段，将整个文本作为一个分段
  if (segments.length === 0 && text.trim()) {
    segments.push({
      id: 1,
      text: text.trim(),
      createTime: new Date()
    })
  }
  
  return segments
}

// 解析和分段处理simpleFormat数据
function parseAndSegmentSimpleFormat(simpleFormatData) {
  const segments = []
  
  console.log('开始处理simpleFormat数据:', simpleFormatData)
  
  simpleFormatData.forEach((item, index) => {
    // 解析编号和文本
    const parsedItem = parseSimpleFormatItem(item)
    
    // 创建分段 - 只存储id和text
    const segment = {
      id: parsedItem.number,  // 编号作为id
      text: parsedItem.text,  // 提取的文本内容
      originalItem: item,     // 保留原始项目
      createTime: new Date()
    }
    
    segments.push(segment)
    console.log(`分段 ${index + 1}: ID=${segment.id}, Text="${segment.text}"`)
  })
  
  console.log(`simpleFormat处理完成，共生成 ${segments.length} 个分段`)
  return segments
}

// 解析simpleFormat项目
function parseSimpleFormatItem(item) {
  // 格式：1.english 或 1.english text
  const match = item.match(/^(\d+)\.(.+)$/)
  
  if (match) {
    return {
      number: parseInt(match[1]),
      text: match[2].trim(),
      original: item
    }
  }
  
  return {
    number: 1,
    text: item,
    original: item
  }
}

// 保存分段记录到数据库
async function saveSegmentRecord(ocrRecordId, segments) {
  try {
    const segmentRecord = {
      ocrRecordId: ocrRecordId,
      segments: segments,
      totalSegments: segments.length,
      status: 'completed',
      createTime: new Date(),
      updateTime: new Date()
    }
    
    const result = await db.collection('segments').add({
      data: segmentRecord
    })
    
    console.log('分段记录保存成功，ID:', result._id)
    console.log('OCR记录ID:', ocrRecordId)
    console.log('分段数量:', segments.length)
    
    return {
      _id: result._id,
      ...segmentRecord
    }
  } catch (error) {
    console.error('保存分段记录失败:', error)
    throw error
  }
}


