// 云函数入口文件
const cloud = require('wx-server-sdk')
const axios = require('axios')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 百度OCR API配置
const BAIDU_APP_ID = '7012956' // 请替换为你的百度AI应用ID
const BAIDU_API_KEY = 'FpupPTi63EKDMRV8lMHHndgd' // 请替换为你的百度AI API Key
const BAIDU_SECRET_KEY = 'vmQgaGXXn1FqLicEaXlayWZWNpkQWzsi' // 请替换为你的百度AI Secret Key
const BAIDU_OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting' // 手写体识别API

// 获取百度AI访问令牌
async function getBaiduAccessToken() {
  const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_API_KEY}&client_secret=${BAIDU_SECRET_KEY}`
  
  try {
    const response = await axios.post(tokenUrl)
    return response.data.access_token
  } catch (error) {
    console.error('获取百度AI访问令牌失败:', error)
    throw new Error('获取访问令牌失败')
  }
}

// 处理识别到的文本：只保留编号和英文，格式为 1.english
function processRecognizedText(wordsResult, confidenceThreshold = 0.7) {
  try {
    // 1. 过滤掉低置信度的结果
    const highConfidenceWords = wordsResult.filter(item => 
      item.probability && item.probability.average >= confidenceThreshold
    );

    // 2. 合并过滤后的文本
    const fullText = highConfidenceWords.map(item => item.words).join('\n');
    
    // 3. 提取简单格式
    const simpleFormat = extractSimpleFormat(fullText);
    
    console.log(`置信度过滤: 原始 ${wordsResult.length} 条, 过滤后 ${highConfidenceWords.length} 条`);

    return {
      originalText: fullText,
      simpleFormat: simpleFormat,
      itemCount: simpleFormat.length
    };
    
  } catch (error) {
    console.error('文本处理失败:', error);
    return {
      originalText: wordsResult.map(item => item.words).join('\n'), // 失败时返回原始文本
      simpleFormat: [],
      itemCount: 0,
      error: error.message
    };
  }
}

// 提取简单格式：只保留编号和英文，格式为 1.english
function extractSimpleFormat(text) {
  const result = [];
  const lines = text.split(/\n+/).filter(line => line.trim());

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine) {
      // 不进行任何过滤，直接为每一行加上行号
      result.push(`${i + 1}. ${trimmedLine}`);
    }
  }
  
  return result;
}



// 云函数入口函数
exports.main = async (event, context) => {
  const { fileID } = event
  
  console.log('开始处理OCR识别请求，fileID:', fileID)
  
  try {
    // 下载云存储中的图片
    console.log('开始下载图片...')
    const downloadResult = await cloud.downloadFile({
      fileID: fileID
    })
    
    const buffer = downloadResult.fileContent
    console.log('图片下载成功，大小:', buffer.length, 'bytes')
    
    // 检查图片大小，如果太大则压缩
    if (buffer.length > 4 * 1024 * 1024) { // 4MB
      console.log('图片过大，建议压缩后重试')
      return {
        success: false,
        error: '图片过大，请压缩后重试',
        errorCode: 'IMAGE_TOO_LARGE',
        text: '图片过大，请压缩后重试'
      }
    }
    
    // 将图片转换为base64格式
    const base64Image = buffer.toString('base64')
    console.log('图片转换为base64完成，长度:', base64Image.length)
    
    // 获取百度AI访问令牌
    console.log('开始获取百度AI访问令牌...')
    const accessToken = await getBaiduAccessToken()
    console.log('获取访问令牌成功')
    
    // 调用百度OCR API
    console.log('开始调用百度OCR API...')
    const ocrUrl = `${BAIDU_OCR_URL}?access_token=${accessToken}`
    
    const requestData = {
      image: base64Image,
      language_type: 'CHN_ENG', // 中英文混合
      detect_direction: 'true', // 检测图像朝向
      paragraph: 'true', // 输出段落信息
      probability: 'true', // 输出置信度以提高精度
      vertexes_location: 'true' // 输出文字区域顶点坐标
    }
    
    const response = await axios.post(ocrUrl, requestData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 30000 // 30秒超时，手写体识别需要更长时间
    })
    
    console.log('百度OCR API调用成功，响应状态:', response.status)
    
    // 处理识别结果
    let recognizedText = ''
    let processedData = null
    
    if (response.data && response.data.words_result && response.data.words_result.length > 0) {
      // 直接将百度API返回的原始结果传入处理函数
      processedData = processRecognizedText(response.data.words_result)
      
      recognizedText = processedData.originalText
      
      console.log('提取到识别文本:', recognizedText)
      console.log('简单格式结果:', processedData.simpleFormat)
    } else {
      console.log('未识别到文字内容')
      recognizedText = '未能识别到文字内容'
      processedData = {
        originalText: '未能识别到文字内容',
        simpleFormat: [],
        itemCount: 0
      }
    }
    
    // 清理和格式化文本
    if (recognizedText && recognizedText !== '未能识别到文字内容') {
      recognizedText = recognizedText.trim()
        .replace(/\n{3,}/g, '\n\n') // 将多个换行符替换为两个
      console.log('格式化后的文本:', recognizedText)
    }
    
    // 保存识别结果到云数据库
    try {
      console.log('开始保存识别结果到云数据库...')
      
      const db = cloud.database()
      const recognitionRecord = {
        fileID: fileID,
        recognizedText: recognizedText,
        processedData: processedData, // 添加处理后的数据
        createTime: new Date(),
        updateTime: new Date(),
        status: 'completed',
        confidence: response.data.words_result && response.data.words_result.length > 0 
          ? response.data.words_result[0].probability?.average || 0 
          : 0,
        wordCount: recognizedText ? recognizedText.split(/\s+/).length : 0,
        // 添加更多元数据
        imageSize: buffer.length,
        ocrProvider: 'baidu',
        language: 'CHN_ENG'
      }
      
      const saveResult = await db.collection('ocr_records').add({
        data: recognitionRecord
      })
      
      console.log('识别结果保存成功，记录ID:', saveResult._id)
      
      const result = {
        success: true,
        simpleFormat: processedData.simpleFormat, // 将simpleFormat放在最外侧
        text: recognizedText,
        processedData: processedData, // 保留完整处理数据
        recordId: saveResult._id,
        confidence: recognitionRecord.confidence,
        wordCount: recognitionRecord.wordCount
      }
      
      console.log('返回成功结果')
      return result
      
    } catch (saveError) {
      console.error('保存识别结果失败:', saveError)
      
      // 即使保存失败，也返回识别结果
      const result = {
        success: true,
        simpleFormat: processedData.simpleFormat, // 将simpleFormat放在最外侧
        text: recognizedText,
        processedData: processedData, // 保留完整处理数据
        saveError: '结果保存失败，但识别成功'
      }
      
      console.log('返回成功结果（保存失败）')
      return result
    }
    
  } catch (error) {
    console.error('百度OCR API识别失败:', error)
    console.error('错误详情:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    })
    
    let errorMessage = '识别失败，请重试'
    let errorCode = 'UNKNOWN_ERROR'
    
    if (error.response) {
      // API返回错误
      const status = error.response.status
      const data = error.response.data
      
      if (status === 400) {
        errorMessage = '图片格式不支持或内容不符合要求'
        errorCode = 'INVALID_INPUT'
      } else if (status === 401) {
        errorMessage = 'API密钥无效'
        errorCode = 'INVALID_API_KEY'
      } else if (status === 403) {
        errorMessage = 'API访问被拒绝'
        errorCode = 'ACCESS_DENIED'
      } else if (status === 429) {
        errorMessage = '请求频率过高，请稍后再试'
        errorCode = 'RATE_LIMIT'
      } else if (status >= 500) {
        errorMessage = '服务器错误，请稍后重试'
        errorCode = 'SERVER_ERROR'
      }
      
      console.error('API错误详情:', { status, data })
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = '请求超时，请检查网络连接'
      errorCode = 'TIMEOUT'
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '网络连接失败'
      errorCode = 'NETWORK_ERROR'
    }
    
    // 保存错误记录到云数据库
    try {
      console.log('开始保存错误记录到云数据库...')
      
      const db = cloud.database()
      const errorRecord = {
        fileID: fileID,
        recognizedText: '',
        createTime: new Date(),
        updateTime: new Date(),
        status: 'failed',
        error: errorMessage,
        errorCode: errorCode,
        confidence: 0,
        wordCount: 0,
        imageSize: 0,
        ocrProvider: 'baidu',
        language: 'CHN_ENG'
      }
      
      const saveResult = await db.collection('ocr_records').add({
        data: errorRecord
      })
      
      console.log('错误记录保存成功，记录ID:', saveResult._id)
      
      const errorResult = {
        success: false,
        simpleFormat: [], // 错误时返回空数组
        error: errorMessage,
        errorCode: errorCode,
        text: '识别失败，请重新上传图片',
        recordId: saveResult._id
      }
      
      console.log('返回错误结果')
      return errorResult
      
    } catch (saveError) {
      console.error('保存错误记录失败:', saveError)
      
      const errorResult = {
        success: false,
        simpleFormat: [], // 错误时返回空数组
        error: errorMessage,
        errorCode: errorCode,
        text: '识别失败，请重新上传图片',
        saveError: '错误记录保存失败'
      }
      
      console.log('返回错误结果（保存失败）')
      return errorResult
    }
  }
}
