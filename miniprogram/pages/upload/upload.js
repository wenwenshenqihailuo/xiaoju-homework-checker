const app = getApp()

Page({
  data: {
    recognizedText: '',
    isProcessing: false,
    // 新增：云开发相关
    cloudEnv: 'cloud1-5gbna8e324332273',
    // 新增：分段预览数据
    segments: [],
    showSegments: false,
    // 新增：检查是否有正在进行的任务
    hasOngoingTask: false,
    ongoingTaskInfo: null,
    // 新增：当前文件ID
    currentFileID: null
  },

  onLoad() {

    
    // 检查是否有正在进行的任务
    this.checkOngoingTask()
  },

  onShow() {
    // 每次页面显示时都检查是否有正在进行的任务
    this.checkOngoingTask()
  },

  // 选择图片
  chooseImage() {
    if (this.data.isProcessing) {
      wx.showToast({
        title: '正在处理中，请稍候',
        icon: 'none'
      })
      return
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadImage(tempFilePath)
      },
      fail: (err) => {
        console.error('选择图片失败:', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'error'
        })
      }
    })
  },

  // 开始AI分析
  async startAIAnalysis() {
    // 保存当前识别的文本和文件ID
    const currentFileID = this.data.currentFileID
    if (!currentFileID) {
      wx.showToast({
        title: '请先上传图片',
        icon: 'none'
      })
      return
    }

    // 直接跳转到结果页面，不显示AI分析进度条
    const segmentCount = this.data.segments.length || 0
    wx.navigateTo({
      url: `/pages/result/result?fileID=${currentFileID}&segmentCount=${segmentCount}&fromUpload=true`
    })
  },

  // 上传图片到云存储
  async uploadImage(filePath) {
    this.setData({ 
      isProcessing: true,
      segments: [],
      showSegments: false
    })
    
    try {
      // 检查文件大小（限制为4MB）
      const fileInfo = await wx.getFileInfo({
        filePath: filePath
      })
      
      if (fileInfo.size > 4 * 1024 * 1024) {
        // 如果图片过大，先压缩
        const compressResult = await wx.compressImage({
          src: filePath,
          quality: 95
        })
        
        filePath = compressResult.tempFilePath
        console.log('图片压缩完成')
      }
      
      // 生成唯一的文件名
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const cloudPath = `uploads/${timestamp}_${randomStr}.jpg`
      
      // 上传到云存储
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })
      
      console.log('上传成功:', uploadResult)
      
      // 保存文件ID
      this.setData({
        currentFileID: uploadResult.fileID
      })
      
      // 调用OCR识别
      await this.performOCRRecognition(uploadResult.fileID)
      
    } catch (error) {
      console.error('上传失败:', error)
      
      let errorMessage = '上传失败，请重试'
      if (error.message.includes('4MB')) {
        errorMessage = '图片大小不能超过4MB，请选择较小的图片'
      } else if (error.message.includes('network')) {
        errorMessage = '网络连接失败，请检查网络后重试'
      } else if (error.message.includes('permission')) {
        errorMessage = '权限不足，请检查云开发配置'
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })
      this.setData({ isProcessing: false })
    }
  },

  // 执行OCR识别
  async performOCRRecognition(fileID) {
    try {
      // 调用云函数进行OCR识别
      const result = await wx.cloud.callFunction({
        name: 'ocr-recognition',
        data: {
          fileID: fileID
        }
      })
      
      console.log('OCR识别结果:', result)
      console.log('结果详情:', JSON.stringify(result, null, 2))
      
      if (result.result && result.result.success) {
        // 识别成功，开始分段处理
        // 调用分段处理云函数
        await this.performSegmentation(result.result)
        
      } else {
        console.error('识别失败，错误信息:', result.result)
        throw new Error(result.result?.error || '识别失败')
      }
      
    } catch (error) {
      console.error('OCR识别失败:', error)
      
      let errorMessage = '识别失败，请重试'
      if (error.message.includes('function')) {
        errorMessage = '云函数调用失败，请检查云函数是否已部署'
      } else if (error.message.includes('quota') || error.message.includes('RATE_LIMIT')) {
        errorMessage = '识别次数已达上限，请稍后再试'
      } else if (error.message.includes('format') || error.message.includes('INVALID_INPUT')) {
        errorMessage = '图片格式不支持，请使用JPG、PNG等格式'
      } else if (error.message.includes('API密钥无效') || error.message.includes('INVALID_API_KEY')) {
        errorMessage = 'API配置错误，请联系管理员'
      } else if (error.message.includes('请求超时') || error.message.includes('TIMEOUT')) {
        errorMessage = '识别超时，请检查网络连接'
      } else if (error.message.includes('网络连接失败') || error.message.includes('NETWORK_ERROR')) {
        errorMessage = '网络连接失败，请检查网络设置'
      }
      
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })
      this.setData({ 
        isProcessing: false,
        recognizedText: '识别失败，请重新上传图片'
      })
    }
  },

  // 执行分段处理
  async performSegmentation(ocrResult) {
    try {
      // 调用分段处理云函数
      const segmentResult = await wx.cloud.callFunction({
        name: 'segment',
        data: {
          ocrResult: ocrResult
        }
      })
      
      console.log('分段处理结果:', segmentResult)
      
      if (segmentResult.result && segmentResult.result.success) {
        // 分段处理成功
        
        // 格式化分段数据用于显示
        const segments = this.formatSegmentsForDisplay(ocrResult.simpleFormat) // 使用 simpleFormat
        
        this.setData({
          segments: segments,
          showSegments: true
        })
        
        // 显示完整的原始识别文本
        const recognizedText = ocrResult.text || '未能识别到文字内容'
        console.log('识别到的文本:', recognizedText)
        
        this.setData({
          recognizedText: recognizedText,
          isProcessing: false
        })
        
        if (recognizedText === '未能识别到文字内容') {
          wx.showModal({
            title: '识别结果',
            content: '未能识别到文字内容，请确保图片清晰且包含文字',
            showCancel: false,
            confirmText: '知道了'
          })
        } else {
          wx.showToast({
            title: '识别完成，请确认内容',
            icon: 'success'
          })
        }
        
      } else {
        throw new Error(segmentResult.result?.error || '分段处理失败')
      }
      
    } catch (error) {
      console.error('分段处理失败:', error)
      
      wx.showToast({
        title: '分段处理失败，请重试',
        icon: 'none',
        duration: 3000
      })
      this.setData({ 
        isProcessing: false,
        recognizedText: '分段处理失败，请重新上传图片'
      })
    }
  },

  // 格式化分段数据用于显示
  formatSegmentsForDisplay(segments) {
    if (!segments || !Array.isArray(segments)) {
      return []
    }
    
    return segments.map((segment, index) => {
      return {
        id: segment.id || (index + 1),
        text: segment.text || segment.originalItem || segment.original || segment,
        displayText: `${segment.id || (index + 1)}. ${segment.text || segment.originalItem || segment.original || segment}`
      }
    })
  },

  // 检查是否有正在进行的任务
  async checkOngoingTask() {
    try {
      // 从本地存储获取任务信息
      const taskInfo = wx.getStorageSync('ongoingTaskInfo')
      
      // 检查任务是否已完成或已保存
      if (taskInfo && taskInfo.taskId && taskInfo.taskStatus === 'processing') {
        // 检查任务是否已经完成（通过检查是否有保存的记录）
        const hasSavedResult = wx.getStorageSync('hasSavedResult')
        
        if (hasSavedResult) {
          // 如果已经保存过结果，清除任务状态
          console.log('检测到已保存结果，清除正在进行的任务状态')
          this.clearTaskState()
          return
        }
        
        // 有正在进行的任务且未保存
        this.setData({
          hasOngoingTask: true,
          ongoingTaskInfo: taskInfo
        })
      } else {
        // 没有正在进行的任务
        this.setData({
          hasOngoingTask: false,
          ongoingTaskInfo: null
        })
      }
    } catch (error) {
      console.error('检查正在进行的任务失败:', error)
      this.setData({
        hasOngoingTask: false,
        ongoingTaskInfo: null
      })
    }
  },

  // 返回正在进行的检查任务
  returnToOngoingTask() {
    const taskInfo = this.data.ongoingTaskInfo
    if (!taskInfo || !taskInfo.taskId) {
      wx.showToast({
        title: '任务信息不存在',
        icon: 'none'
      })
      return
    }

    // 跳转到result页面，传递任务信息
    wx.navigateTo({
      url: `/pages/result/result?taskId=${taskInfo.taskId}&fromOngoing=true`
    })
  },

  // 页面卸载时清理
  onUnload() {
    // 清理资源
  },

  // 清除任务状态
  clearTaskState() {
    console.log('清除任务状态')
    
    this.setData({
      hasOngoingTask: false,
      ongoingTaskInfo: null
    })
    
    // 清除本地存储的任务信息
    try {
      wx.removeStorageSync('ongoingTaskInfo')
      console.log('已清除本地存储的任务信息')
    } catch (error) {
      console.warn('清除本地存储失败:', error)
    }
  },

  // 重置到初始状态
  resetToInitialState() {
    console.log('重置upload页面到初始状态')
    
    this.setData({
      recognizedText: '',
      isProcessing: false,
      segments: [],
      showSegments: false,
      hasOngoingTask: false,
      ongoingTaskInfo: null,
      currentFileID: null
    })
    
    // 清除本地存储的任务信息
    try {
      wx.removeStorageSync('ongoingTaskInfo')
      console.log('已清除本地存储的任务信息')
      
      // 设置标记，表示结果已经保存，不再显示正在进行的任务
      wx.setStorageSync('hasSavedResult', true)
      console.log('已设置结果保存标记')
    } catch (error) {
      console.warn('清除本地存储失败:', error)
    }
    
    // 强制重新检查任务状态，确保UI更新
    this.checkOngoingTask()
  }
})
