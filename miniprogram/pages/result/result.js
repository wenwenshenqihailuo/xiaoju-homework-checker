Page({
  data: {
    loading: true,
    error: null,
    overallScore: 0,
    scoreDescription: '',
    questionResults: [],
    flattenedItemResults: [],
    simpleFormatData: [],
    itemCount: 0,
    statistics: null,
    analysisRecordId: null,
    taskId: null,
    taskStatus: 'processing',
    progress: {
      processed: 0,
      total: 0,
      percentage: 0
    },
    hasMoreResults: true,
    isPolling: false,
    pollingInterval: null,
    realtimeResults: [],
    showRealtimeUpdate: false,
    fileID: null,
    segmentCount: 0,
    segmentRecordId: null,
    sourceSegments: [],
    sourceText: '',
    isSaving: false
  },

  onLoad(options) {
    console.log('Result page load:', options)

    if (options.fileID) {
      this.setData({ fileID: options.fileID })
    }

    if (options.segmentCount) {
      this.setData({ segmentCount: parseInt(options.segmentCount, 10) || 0 })
    }

    if (options.segmentRecordId) {
      this.setData({ segmentRecordId: options.segmentRecordId })
    }

    if (options.fromUpload === 'true') {
      const currentAnalysisInput = wx.getStorageSync('currentAnalysisInput')

      if (currentAnalysisInput && currentAnalysisInput.updatedAt) {
        wx.removeStorageSync('currentAnalysisInput')
        this.setData({
          sourceSegments: currentAnalysisInput.sourceSegments || [],
          sourceText: currentAnalysisInput.sourceText || '',
          simpleFormatData: (currentAnalysisInput.sourceSegments || []).map(item => item.text || item.originalItem || '')
        }, () => {
          this.startAnalysis()
        })
      } else {
        this.startAnalysis()
      }
      return
    }

    if (options.fromOngoing === 'true' && options.taskId) {
      this.loadOngoingTask(options.taskId)
      return
    }

    if (options.fromHistory === 'true') {
      if (options.analysisRecordId) {
        this.loadSavedAnalysisResult(options.analysisRecordId)
      } else if (options.taskId) {
        this.loadSavedAnalysisResultByTaskId(options.taskId)
      }
    }
  },

  onUnload() {
    this.stopPolling()
  },

  startAnalysis() {
    console.log('start analysis')

    this.setData({
      loading: true,
      isLoading: true,
      showRealtimeUpdate: false,
      taskStatus: 'processing',
      progress: {
        processed: 0,
        total: 0,
        percentage: 0
      }
    })

    this.startNewTask()
  },

  loadOngoingTask(taskId) {
    const taskInfo = wx.getStorageSync('ongoingTaskInfo')

    if (!taskInfo || taskInfo.taskId !== taskId) {
      wx.showModal({
        title: '任务不存在',
        content: '无法找到正在进行的任务，请重新开始。',
        showCancel: false,
        confirmText: '知道了'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.applyResultState(taskInfo.questionResults || [], {
      taskId,
      taskStatus: taskInfo.taskStatus || 'processing',
      progress: taskInfo.progress || { processed: 0, total: 0, percentage: 0 },
      currentBatch: taskInfo.currentBatch || 0,
      totalBatches: taskInfo.totalBatches || 0,
      fileID: taskInfo.fileID || null,
      segmentRecordId: taskInfo.segmentRecordId || null,
      sourceSegments: taskInfo.sourceSegments || [],
      sourceText: taskInfo.sourceText || '',
      simpleFormatData: taskInfo.simpleFormatData || (taskInfo.sourceSegments || []).map(item => item.text || item.originalItem || ''),
      loading: false,
      isLoading: false
    })

    if (taskInfo.taskStatus === 'processing') {
      this.continueTask()
    }
  },

  async loadSavedAnalysisResult(analysisRecordId) {
    try {
      wx.showLoading({ title: '加载中...' })

      const result = await wx.cloud.callFunction({
        name: 'result-save',
        data: {
          action: 'getSavedAnalysisResult',
          data: { analysisRecordId }
        }
      })

      if (!result.result?.success) {
        throw new Error(result.result?.error || '加载失败')
      }

      this.applySavedAnalysisResult(result.result.data, analysisRecordId)
    } catch (error) {
      wx.hideLoading()
      console.error('loadSavedAnalysisResult failed:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async loadSavedAnalysisResultByTaskId(taskId) {
    try {
      wx.showLoading({ title: '加载中...' })

      const result = await wx.cloud.callFunction({
        name: 'result-save',
        data: {
          action: 'getSavedAnalysisResult',
          data: { taskId }
        }
      })

      if (!result.result?.success) {
        throw new Error(result.result?.error || '加载失败')
      }

      this.applySavedAnalysisResult(result.result.data)
    } catch (error) {
      wx.hideLoading()
      console.error('loadSavedAnalysisResultByTaskId failed:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  applySavedAnalysisResult(analysisData, fallbackAnalysisRecordId = null) {
    if (!analysisData) {
      throw new Error('未找到分析结果')
    }

    this.applyResultState(analysisData.questionResults || [], {
      analysisRecordId: fallbackAnalysisRecordId || analysisData._id || null,
      simpleFormatData: analysisData.simpleFormatData || [],
      fileID: analysisData.fileID || null,
      segmentCount: analysisData.segmentCount || 0,
      taskId: analysisData.taskId || null,
      taskStatus: 'completed',
      loading: false,
      isLoading: false
    })

    wx.hideLoading()
    wx.showToast({
      title: '加载成功',
      icon: 'success'
    })
  },

  startNewTask() {
    const callData = { isStartNewTask: true }

    if (this.data.fileID) {
      callData.fileID = this.data.fileID
    }

    if (this.data.segmentRecordId) {
      callData.segmentRecordId = this.data.segmentRecordId
    }

    if (this.data.sourceSegments.length > 0) {
      callData.sourceSegments = this.data.sourceSegments
    }

    if (this.data.sourceText) {
      callData.sourceText = this.data.sourceText
    }

    wx.cloud.callFunction({
      name: 'ai-analysis',
      data: callData
    }).then(res => {
      if (!res.result?.success) {
        throw new Error(res.result?.error || '开始分析失败')
      }

      const {
        taskId,
        hasMore,
        currentBatch,
        totalBatches,
        processedCount,
        totalCount,
        results
      } = res.result

      this.setData({
        taskId,
        currentBatch,
        totalBatches
      })

      this.updateProgress(processedCount, totalCount)
      this.displayResults(results)

      if (hasMore) {
        this.continueTask()
      } else {
        this.setData({
          taskStatus: 'completed',
          loading: false,
          isLoading: false
        })
      }
    }).catch(error => {
      console.error('startNewTask failed:', error)
      this.setData({
        loading: false,
        isLoading: false,
        taskStatus: 'failed'
      })
      wx.showToast({
        title: '开始分析失败',
        icon: 'error'
      })
    })
  },

  continueTask() {
    if (!this.data.taskId || this.data.taskStatus !== 'processing') {
      return
    }

    wx.cloud.callFunction({
      name: 'ai-analysis',
      data: {
        isContinueTask: true,
        taskId: this.data.taskId,
        currentBatch: this.data.currentBatch
      }
    }).then(res => {
      if (!res.result?.success) {
        if (res.result?.status === 'stopped') {
          this.setData({
            loading: false,
            isLoading: false,
            taskStatus: 'stopped'
          })
          wx.showToast({
            title: '分析已停止',
            icon: 'none'
          })
          return
        }

        throw new Error(res.result?.error || '处理失败')
      }

      const {
        hasMore,
        currentBatch,
        processedCount,
        totalCount,
        results,
        allResults
      } = res.result

      this.setData({ currentBatch })
      this.updateProgress(processedCount, totalCount)
      this.displayResults(results, allResults)

      if (hasMore) {
        this.pollingTimer = setTimeout(() => {
          if (this.data.taskStatus === 'processing') {
            this.continueTask()
          }
        }, 1000)
      } else {
        this.setData({
          taskStatus: 'completed',
          loading: false,
          isLoading: false
        })
        wx.showToast({
          title: '分析完成',
          icon: 'success'
        })
      }
    }).catch(error => {
      console.error('continueTask failed:', error)
      this.setData({
        loading: false,
        isLoading: false,
        taskStatus: 'failed'
      })
      wx.showToast({
        title: '处理失败',
        icon: 'error'
      })
    })
  },

  updateProgress(processed, total) {
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0

    this.setData({
      progress: {
        processed,
        total,
        percentage
      }
    })

    this.saveTaskInfoToStorage()
  },

  buildFlattenedItemResults(results = []) {
    const flattened = []

    results.forEach((question, questionIndex) => {
      const questionTitle = question.title || question.question || question.answer || ''
      const questionItems = Array.isArray(question.itemResults) ? question.itemResults : []

      if (questionItems.length > 0) {
        questionItems.forEach((item, itemIndex) => {
          flattened.push({
            flatKey: `${question.id || questionIndex + 1}-${item.itemIndex || itemIndex + 1}`,
            questionIndex: questionIndex + 1,
            questionTitle,
            itemIndex: flattened.length + 1,
            originalItem: item.originalItem || questionTitle || '',
            analysis: item.analysis || question.analysis || '',
            suggestion: item.suggestion || question.suggestion || '',
            correctAnswer: item.correctAnswer || question.correctAnswer || null,
            isCorrect: typeof item.isCorrect === 'boolean'
              ? item.isCorrect
              : question.status === 'correct',
            status: typeof item.isCorrect === 'boolean'
              ? (item.isCorrect ? 'correct' : 'incorrect')
              : (question.status || 'incorrect')
          })
        })
        return
      }

      if (!question.title && !question.question && !question.answer && !question.analysis) {
        return
      }

      flattened.push({
        flatKey: `${question.id || questionIndex + 1}-top`,
        questionIndex: questionIndex + 1,
        questionTitle,
        itemIndex: flattened.length + 1,
        originalItem: questionTitle,
        analysis: question.analysis || '',
        suggestion: question.suggestion || '',
        correctAnswer: question.correctAnswer || null,
        isCorrect: question.status === 'correct',
        status: question.status || 'incorrect'
      })
    })

    return flattened
  },

  buildResultMetrics(results = []) {
    const flattenedItemResults = this.buildFlattenedItemResults(results)
    const validItems = flattenedItemResults.filter(item => item.status === 'correct' || item.status === 'incorrect')
    const correctCount = validItems.filter(item => item.status === 'correct').length
    const itemCount = flattenedItemResults.length
    const accuracy = validItems.length > 0 ? Math.round((correctCount / validItems.length) * 100) : 0

    return {
      flattenedItemResults,
      itemCount,
      correctCount,
      accuracy,
      overallScore: accuracy
    }
  },

  applyResultState(questionResults = [], extraState = {}) {
    const metrics = this.buildResultMetrics(questionResults)
    const baseStatistics = extraState.statistics || this.data.statistics || {}
    const scoreDescription = metrics.itemCount > 0
      ? this.getScoreDescription(metrics.overallScore)
      : '暂无可评分结果'

    const nextState = {
      ...extraState,
      questionResults,
      flattenedItemResults: metrics.flattenedItemResults,
      itemCount: metrics.itemCount,
      overallScore: metrics.overallScore,
      scoreDescription,
      statistics: {
        ...baseStatistics,
        totalItems: metrics.itemCount,
        correctItems: metrics.correctCount,
        accuracy: metrics.accuracy
      }
    }

    if (!nextState.simpleFormatData || nextState.simpleFormatData.length === 0) {
      nextState.simpleFormatData = questionResults.map(item => item.title || item.question || item.answer || '').filter(Boolean)
    }

    this.setData(nextState)
  },

  displayResults(newResults, allResults = null) {
    const processedIncoming = this.processResults(newResults)
    const processedResults = allResults
      ? this.processResults(allResults)
      : [...this.data.questionResults, ...processedIncoming]

    this.applyResultState(processedResults, {
      simpleFormatData: this.data.simpleFormatData.length > 0
        ? this.data.simpleFormatData
        : processedResults.map(item => item.title).filter(Boolean)
    })

    this.saveTaskInfoToStorage()
  },

  saveTaskInfoToStorage() {
    try {
      wx.setStorageSync('ongoingTaskInfo', {
        taskId: this.data.taskId,
        taskStatus: this.data.taskStatus,
        progress: this.data.progress,
        currentBatch: this.data.currentBatch,
        totalBatches: this.data.totalBatches,
        fileID: this.data.fileID,
        segmentRecordId: this.data.segmentRecordId,
        sourceSegments: this.data.sourceSegments,
        sourceText: this.data.sourceText,
        questionResults: this.data.questionResults,
        flattenedItemResults: this.data.flattenedItemResults,
        simpleFormatData: this.data.simpleFormatData,
        overallScore: this.data.overallScore,
        scoreDescription: this.data.scoreDescription,
        itemCount: this.data.itemCount,
        statistics: this.data.statistics,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error('saveTaskInfoToStorage failed:', error)
    }
  },

  processResults(results = []) {
    return results.map(result => {
      if (result.error) {
        return {
          id: result.segmentId || result.id,
          title: result.originalItem || result.title || '',
          question: result.originalItem || result.question || '',
          answer: result.originalItem || result.answer || '',
          status: 'error',
          statusText: '分析失败',
          analysis: `分析失败：${result.error}`,
          itemAnalyses: [],
          spellingErrors: [],
          grammarErrors: [],
          wordSuggestions: {},
          correctAnswer: null,
          suggestion: '请重新检查后再试',
          itemResults: []
        }
      }

      const analysis = result.analysis || {}
      return {
        id: result.segmentId || result.id,
        title: result.originalItem || result.title || '',
        question: result.originalItem || result.question || '',
        answer: result.originalItem || result.answer || '',
        status: analysis.isCorrect ? 'correct' : 'incorrect',
        statusText: analysis.isCorrect ? '正确' : '需要改进',
        analysis: analysis.analysis || '暂无分析',
        itemAnalyses: analysis.itemAnalyses || [],
        spellingErrors: analysis.spellingErrors || [],
        grammarErrors: analysis.grammarErrors || [],
        wordSuggestions: analysis.wordSuggestions || {},
        correctAnswer: analysis.correctAnswer || null,
        suggestion: analysis.suggestion || '',
        itemResults: analysis.itemResults || []
      }
    })
  },

  stopTask() {
    wx.showModal({
      title: '确认停止',
      content: '确定要停止当前的 AI 分析吗？',
      confirmText: '停止',
      confirmColor: '#ff4d4f',
      cancelText: '继续',
      success: (res) => {
        if (res.confirm) {
          this.performStopTask()
        }
      }
    })
  },

  performStopTask() {
    this.stopPolling()

    if (this.data.taskId && this.data.taskStatus === 'processing') {
      this.notifyCloudFunctionToStop()
    }

    this.setData({
      taskStatus: 'stopped',
      loading: false,
      isLoading: false,
      taskId: null,
      currentBatch: 0,
      totalBatches: 0,
      progress: {
        processed: 0,
        total: 0,
        percentage: 0
      }
    })

    this.saveTaskInfoToStorage()

    wx.showToast({
      title: '分析已停止',
      icon: 'none',
      duration: 2000
    })
  },

  recheck() {
    this.stopPolling()
    this.applyResultState([], {
      simpleFormatData: this.data.sourceSegments.map(item => item.text || item.originalItem || ''),
      taskId: null,
      currentBatch: 0,
      totalBatches: 0,
      taskStatus: 'processing',
      progress: {
        processed: 0,
        total: 0,
        percentage: 0
      }
    })

    this.startAnalysis()
  },

  stopPolling() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }

    if (this.data.pollingInterval) {
      clearInterval(this.data.pollingInterval)
      this.setData({ pollingInterval: null })
    }
  },

  notifyCloudFunctionToStop() {
    wx.cloud.callFunction({
      name: 'ai-analysis',
      data: {
        action: 'stopTask',
        taskId: this.data.taskId
      }
    }).catch(error => {
      console.error('notifyCloudFunctionToStop failed:', error)
    })
  },

  getScoreDescription(score) {
    if (score >= 90) return '优秀，继续保持'
    if (score >= 80) return '良好，还有提升空间'
    if (score >= 70) return '一般，需要继续练习'
    if (score >= 60) return '及格，建议查漏补缺'
    return '需要继续加强'
  },

  viewItemDetail(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.flattenedItemResults[index]

    if (!item) {
      return
    }

    wx.showModal({
      title: `第 ${item.itemIndex} 项详情`,
      content: `原始内容：${item.originalItem || '无'}\n\n分析：${item.analysis || '暂无'}\n\n建议：${item.suggestion || '无'}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  async saveResult() {
    if (this.data.isSaving) {
      return
    }

    try {
      this.setData({ isSaving: true })
      wx.showLoading({ title: '保存中...' })

      const analysisData = {
        taskId: this.data.taskId,
        analysisRecordId: this.data.analysisRecordId,
        overallScore: this.data.overallScore,
        scoreDescription: this.data.scoreDescription,
        questionResults: this.data.questionResults,
        simpleFormatData: this.data.simpleFormatData,
        itemCount: this.data.itemCount,
        statistics: this.data.statistics,
        fileID: this.data.fileID,
        segmentCount: this.data.segmentCount,
        createTime: new Date(),
        updateTime: new Date(),
        status: 'completed'
      }

      const saveResult = await wx.cloud.callFunction({
        name: 'result-save',
        data: {
          action: 'saveResultData',
          data: analysisData
        }
      })

      if (!saveResult.result?.success) {
        throw new Error(saveResult.result?.error || '保存失败')
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 2000
      })

      this.setData({
        analysisRecordId: saveResult.result.recordId
      })

      this.clearUploadStateAndNavigateToHistory()
    } catch (error) {
      wx.hideLoading()
      console.error('saveResult failed:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error',
        duration: 2000
      })
    } finally {
      this.setData({ isSaving: false })
    }
  },

  clearUploadStateAndNavigateToHistory() {
    try {
      const uploadPage = getCurrentPages().find(page => page.route === 'pages/upload/upload')
      if (uploadPage && typeof uploadPage.resetToInitialState === 'function') {
        uploadPage.resetToInitialState()
      }
    } catch (error) {
      console.error('clearUploadStateAndNavigateToHistory failed:', error)
    }

    setTimeout(() => {
      wx.switchTab({
        url: '/pages/history/history'
      })
    }, 1500)
  },

  goBack() {
    this.stopPolling()
    wx.navigateBack({ delta: 1 })
  },

  onShareAppMessage() {
    return {
      title: `我的英语检查得分：${this.data.overallScore}%`,
      path: '/pages/result/result'
    }
  }
})
