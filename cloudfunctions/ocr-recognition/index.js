const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const BAIDU_OCR_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting'

function requireSecret(name, label = name) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`缺少云函数环境变量 ${name}（${label}）`)
  }

  return value
}

async function getBaiduAccessToken() {
  const baiduApiKey = requireSecret('BAIDU_API_KEY', '百度 OCR API Key')
  const baiduSecretKey = requireSecret('BAIDU_SECRET_KEY', '百度 OCR Secret Key')
  const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${baiduApiKey}&client_secret=${baiduSecretKey}`

  try {
    const response = await axios.post(tokenUrl)

    if (!response.data || !response.data.access_token) {
      const detailMessage = response.data?.error_description || response.data?.error_msg || '未返回 access_token'
      throw new Error(`获取访问令牌失败: ${detailMessage}`)
    }

    return response.data.access_token
  } catch (error) {
    console.error('获取百度AI访问令牌失败:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data || null
    })

    if (error.response) {
      const status = error.response.status
      const detailMessage = error.response.data?.error_description || error.response.data?.error_msg || `HTTP_${status}`

      if (status === 400 || status === 401 || status === 403) {
        throw new Error(`INVALID_API_KEY: 获取访问令牌失败，${detailMessage}`)
      }

      throw new Error(`获取访问令牌失败: ${detailMessage}`)
    }

    if (error.code === 'ECONNABORTED') {
      throw new Error('TIMEOUT: 获取访问令牌失败，请求超时')
    }

    if (['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code)) {
      throw new Error('NETWORK_ERROR: 获取访问令牌失败，网络连接异常')
    }

    throw new Error(`获取访问令牌失败: ${error.message || '未知错误'}`)
  }
}

function extractSimpleFormat(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => `${index + 1}. ${line}`)
}

function processRecognizedText(wordsResult, confidenceThreshold = 0.7) {
  try {
    const highConfidenceWords = (wordsResult || []).filter(item => {
      return item.probability && item.probability.average >= confidenceThreshold
    })

    const effectiveWords = highConfidenceWords.length > 0 ? highConfidenceWords : (wordsResult || [])
    const fullText = effectiveWords.map(item => item.words).join('\n').trim()
    const simpleFormat = extractSimpleFormat(fullText)

    return {
      originalText: fullText || '未能识别到文字内容',
      simpleFormat,
      itemCount: simpleFormat.length
    }
  } catch (error) {
    console.error('processRecognizedText failed:', error)
    return {
      originalText: (wordsResult || []).map(item => item.words).join('\n'),
      simpleFormat: [],
      itemCount: 0,
      error: error.message
    }
  }
}

function mapRecognitionError(error) {
  let errorMessage = '识别失败，请重试'
  let errorCode = 'UNKNOWN_ERROR'

  if (error.response) {
    const status = error.response.status

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
  } else if (error.message && error.message.includes('缺少云函数环境变量')) {
    errorMessage = error.message
    errorCode = 'CONFIG_MISSING'
  } else if (error.message && error.message.includes('INVALID_API_KEY')) {
    errorMessage = 'API密钥无效'
    errorCode = 'INVALID_API_KEY'
  } else if (error.message && error.message.includes('TIMEOUT')) {
    errorMessage = '请求超时，请检查网络连接'
    errorCode = 'TIMEOUT'
  } else if (error.message && error.message.includes('NETWORK_ERROR')) {
    errorMessage = '网络连接失败'
    errorCode = 'NETWORK_ERROR'
  } else if (error.code === 'ECONNABORTED') {
    errorMessage = '请求超时，请检查网络连接'
    errorCode = 'TIMEOUT'
  } else if (['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code)) {
    errorMessage = '网络连接失败'
    errorCode = 'NETWORK_ERROR'
  } else if (error.message) {
    errorMessage = error.message
  }

  return {
    errorMessage,
    errorCode
  }
}

async function saveOcrRecord(record) {
  const result = await cloud.database().collection('ocr_records').add({
    data: record
  })

  return result._id
}

exports.main = async (event) => {
  const { fileID } = event

  console.log('ocr-recognition called:', { fileID })

  try {
    const downloadResult = await cloud.downloadFile({ fileID })
    const buffer = downloadResult.fileContent

    if (buffer.length > 4 * 1024 * 1024) {
      return {
        success: false,
        error: '图片过大，请压缩后重试',
        errorCode: 'IMAGE_TOO_LARGE',
        text: '图片过大，请压缩后重试'
      }
    }

    const base64Image = buffer.toString('base64')
    const accessToken = await getBaiduAccessToken()
    const ocrUrl = `${BAIDU_OCR_URL}?access_token=${accessToken}`

    const requestData = {
      image: base64Image,
      language_type: 'CHN_ENG',
      detect_direction: 'true',
      paragraph: 'true',
      probability: 'true',
      vertexes_location: 'true'
    }

    const response = await axios.post(ocrUrl, requestData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 30000
    })

    let processedData
    let recognizedText

    if (response.data?.words_result && response.data.words_result.length > 0) {
      processedData = processRecognizedText(response.data.words_result)
      recognizedText = processedData.originalText
    } else {
      processedData = {
        originalText: '未能识别到文字内容',
        simpleFormat: [],
        itemCount: 0
      }
      recognizedText = processedData.originalText
    }

    const recognitionRecord = {
      fileID,
      recognizedText,
      processedData,
      createTime: new Date(),
      updateTime: new Date(),
      status: 'completed',
      confidence: response.data?.words_result?.[0]?.probability?.average || 0,
      wordCount: recognizedText ? recognizedText.split(/\s+/).filter(Boolean).length : 0,
      imageSize: buffer.length,
      ocrProvider: 'baidu',
      language: 'CHN_ENG'
    }

    try {
      const recordId = await saveOcrRecord(recognitionRecord)
      return {
        success: true,
        simpleFormat: processedData.simpleFormat,
        text: recognizedText,
        processedData,
        recordId,
        confidence: recognitionRecord.confidence,
        wordCount: recognitionRecord.wordCount
      }
    } catch (saveError) {
      console.error('save success ocr record failed:', saveError)
      return {
        success: true,
        simpleFormat: processedData.simpleFormat,
        text: recognizedText,
        processedData,
        saveError: '结果保存失败，但识别成功'
      }
    }
  } catch (error) {
    console.error('ocr-recognition failed:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    })

    const { errorMessage, errorCode } = mapRecognitionError(error)

    try {
      const recordId = await saveOcrRecord({
        fileID,
        recognizedText: '',
        createTime: new Date(),
        updateTime: new Date(),
        status: 'failed',
        error: errorMessage,
        errorCode,
        confidence: 0,
        wordCount: 0,
        imageSize: 0,
        ocrProvider: 'baidu',
        language: 'CHN_ENG'
      })

      return {
        success: false,
        simpleFormat: [],
        error: errorMessage,
        errorCode,
        text: '识别失败，请重新上传图片',
        recordId
      }
    } catch (saveError) {
      console.error('save failed ocr record failed:', saveError)
      return {
        success: false,
        simpleFormat: [],
        error: errorMessage,
        errorCode,
        text: '识别失败，请重新上传图片',
        saveError: '错误记录保存失败'
      }
    }
  }
}
