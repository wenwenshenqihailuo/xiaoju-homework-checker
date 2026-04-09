// pages/result/result.js
Page({
  data: {
    loading: true,
    error: null,
    overallScore: 0,
    scoreDescription: '',
    questionResults: [],
    simpleFormatData: [],
    itemCount: 0,
    statistics: null,
    analysisRecordId: null,
    
    // 新增：任务相关状态
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
    
    // 新增：实时更新相关
    realtimeResults: [],
    showRealtimeUpdate: false,
    
    // 新增：从upload页面传递的参数
    fileID: null,
    segmentCount: 0
  },

  onLoad: function (options) {
    console.log('Result页面加载，参数:', options)
    
    // 保存传递过来的参数
    if (options.fileID) {
      this.setData({
        fileID: options.fileID
      })
    }
    
    if (options.segmentCount) {
      this.setData({
        segmentCount: parseInt(options.segmentCount)
      })
    }
    
    // 如果是从upload页面跳转过来的，直接开始分析
    if (options.fromUpload === 'true') {
      this.startAnalysis()
    }
    
    // 如果是从upload页面返回的正在进行的任务
    if (options.fromOngoing === 'true' && options.taskId) {
      this.loadOngoingTask(options.taskId)
    }
    
    // 如果是从history页面跳转过来的，加载已保存的分析结果
    if (options.fromHistory === 'true') {
      if (options.analysisRecordId) {
        this.loadSavedAnalysisResult(options.analysisRecordId)
      } else if (options.taskId) {
        this.loadSavedAnalysisResultByTaskId(options.taskId)
      }
    }
  },

  onUnload: function () {
    // 清理轮询定时器
    this.stopPolling()
  },

  // 开始AI分析
  startAnalysis: function() {
    console.log('开始AI分析');
    
    this.setData({
      isLoading: true,
      showRealtimeUpdate: true,
      taskStatus: 'processing',
      progress: {
        processed: 0,
        total: 0,
        percentage: 0
      }
    });

    // 3秒后隐藏实时更新提示
    setTimeout(() => {
      this.setData({
        showRealtimeUpdate: false
      });
    }, 3000);

    // 开始新任务
    this.startNewTask();
  },

  // 加载正在进行的任务
  loadOngoingTask: function(taskId) {
    console.log('加载正在进行的任务:', taskId)
    
    // 从本地存储获取任务信息
    const taskInfo = wx.getStorageSync('ongoingTaskInfo')
    
    if (taskInfo && taskInfo.taskId === taskId) {
      // 恢复任务状态
      this.setData({
        taskId: taskId,
        taskStatus: taskInfo.taskStatus || 'processing',
        progress: taskInfo.progress || { processed: 0, total: 0, percentage: 0 },
        currentBatch: taskInfo.currentBatch || 0,
        totalBatches: taskInfo.totalBatches || 0,
        questionResults: taskInfo.questionResults || [],
        simpleFormatData: taskInfo.simpleFormatData || [],
        overallScore: taskInfo.overallScore || 0,
        scoreDescription: taskInfo.scoreDescription || '',
        itemCount: taskInfo.itemCount || 0,
        statistics: taskInfo.statistics || null,
        isLoading: false
      })
      
      // 如果任务还在进行中，继续轮询
      if (taskInfo.taskStatus === 'processing') {
        this.continueTask()
      }
    } else {
      // 任务信息不存在，显示错误
      wx.showModal({
        title: '任务不存在',
        content: '无法找到正在进行的任务，请重新开始',
        showCancel: false,
        confirmText: '知道了'
      })
      
      // 返回upload页面
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 加载已保存的分析结果
  async loadSavedAnalysisResult(analysisRecordId) {
    try {
      console.log('加载已保存的分析结果:', analysisRecordId)
      
      wx.showLoading({ title: '加载中...' })
      
      // 从云数据库加载分析结果
      const db = wx.cloud.database()
      const result = await db.collection('ai_analysis_results')
        .doc(analysisRecordId)
        .get()
      
      if (result.data) {
        const analysisData = result.data
        console.log('加载到分析结果:', analysisData)
        
        // 设置页面数据
        this.setData({
          analysisRecordId: analysisRecordId,
          overallScore: analysisData.overallScore || 0,
          scoreDescription: analysisData.scoreDescription || '',
          questionResults: analysisData.questionResults || [],
          simpleFormatData: analysisData.simpleFormatData || [],
          itemCount: analysisData.itemCount || 0,
          statistics: analysisData.statistics || null,
          fileID: analysisData.fileID,
          segmentCount: analysisData.segmentCount || 0,
          taskId: analysisData.taskId,
          taskStatus: 'completed',
          loading: false,
          isLoading: false
        })
        
        wx.hideLoading()
        wx.showToast({
          title: '加载成功',
          icon: 'success'
        })
        
      } else {
        throw new Error('未找到分析结果')
      }
      
    } catch (error) {
      wx.hideLoading()
      console.error('加载已保存的分析结果失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
      
      // 返回history页面
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 根据任务ID加载已保存的分析结果
  async loadSavedAnalysisResultByTaskId(taskId) {
    try {
      console.log('根据任务ID加载已保存的分析结果:', taskId)
      
      wx.showLoading({ title: '加载中...' })
      
      // 从云数据库加载分析结果
      const db = wx.cloud.database()
      const result = await db.collection('ai_analysis_results')
        .where({
          taskId: taskId
        })
        .orderBy('createTime', 'desc')
        .limit(1)
        .get()
      
      if (result.data && result.data.length > 0) {
        const analysisData = result.data[0]
        console.log('加载到分析结果:', analysisData)
        
        // 设置页面数据
        this.setData({
          analysisRecordId: analysisData._id,
          overallScore: analysisData.overallScore || 0,
          scoreDescription: analysisData.scoreDescription || '',
          questionResults: analysisData.questionResults || [],
          simpleFormatData: analysisData.simpleFormatData || [],
          itemCount: analysisData.itemCount || 0,
          statistics: analysisData.statistics || null,
          fileID: analysisData.fileID,
          segmentCount: analysisData.segmentCount || 0,
          taskId: taskId,
          taskStatus: 'completed',
          loading: false,
          isLoading: false
        })
        
        wx.hideLoading()
        wx.showToast({
          title: '加载成功',
          icon: 'success'
        })
        
      } else {
        throw new Error('未找到分析结果')
      }
      
    } catch (error) {
      wx.hideLoading()
      console.error('根据任务ID加载已保存的分析结果失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
      
      // 返回history页面
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 开始新任务
  startNewTask: function() {
    console.log('开始新任务');
    
    const callData = {
      isStartNewTask: true
    }
    
    // 如果有fileID，传递给云函数
    if (this.data.fileID) {
      callData.fileID = this.data.fileID
    }
    
    wx.cloud.callFunction({
      name: 'ai-analysis',
      data: callData
    }).then(res => {
      console.log('新任务开始结果：', res);
      
      if (res.result.success) {
        const { taskId, hasMore, currentBatch, totalBatches, processedCount, totalCount, results } = res.result;
        
        // 保存任务ID
        this.setData({
          taskId: taskId,
          currentBatch: currentBatch,
          totalBatches: totalBatches
        });

        // 更新进度
        this.updateProgress(processedCount, totalCount);
        
        // 显示第一批结果
        this.displayResults(results);
        
        // 如果还有更多批次，继续处理
        if (hasMore) {
          console.log(`第${currentBatch}批完成，还有更多批次，继续处理...`);
          this.continueTask();
        } else {
          console.log('所有批次处理完成');
          this.setData({
            taskStatus: 'completed',
            isLoading: false
          });
        }
        
      } else {
        console.error('开始新任务失败：', res.result.error);
        this.setData({
          isLoading: false,
          taskStatus: 'failed'
        });
        wx.showToast({
          title: '开始分析失败',
          icon: 'error'
        });
      }
    }).catch(error => {
      console.error('调用云函数失败：', error);
      this.setData({
        isLoading: false,
        taskStatus: 'failed'
      });
      wx.showToast({
        title: '网络错误',
        icon: 'error'
      });
    });
  },

  // 继续处理下一批
  continueTask: function() {
    if (!this.data.taskId || this.data.taskStatus !== 'processing') {
      console.log('任务已完成、未开始或已停止，停止继续处理');
      return;
    }

    const currentBatch = this.data.currentBatch;
    console.log(`继续处理第${currentBatch + 1}批`);

    // 再次检查任务状态，防止在异步调用期间被停止
    if (this.data.taskStatus !== 'processing') {
      console.log('任务状态已改变，停止继续处理');
      return;
    }

    wx.cloud.callFunction({
      name: 'ai-analysis',
      data: {
        isContinueTask: true,
        taskId: this.data.taskId,
        currentBatch: currentBatch
      }
    }).then(res => {
      console.log(`第${currentBatch + 1}批处理结果：`, res);
      
      if (res.result.success) {
        const { hasMore, currentBatch: newBatch, processedCount, totalCount, results, allResults, message } = res.result;
        
        // 更新批次信息
        this.setData({
          currentBatch: newBatch
        });

        // 更新进度
        this.updateProgress(processedCount, totalCount);
        
        // 显示当前批次结果
        this.displayResults(results, allResults);
        
        console.log(message);
        
        // 如果还有更多批次，继续处理
        if (hasMore) {
          console.log(`第${newBatch}批完成，还有更多批次，继续处理...`);
          // 延迟1秒后继续下一批，避免过于频繁的调用
          this.pollingTimer = setTimeout(() => {
            // 再次检查任务状态
            if (this.data.taskStatus === 'processing') {
              this.continueTask();
            } else {
              console.log('任务已停止，不再继续处理');
            }
          }, 1000);
        } else {
          console.log('所有批次处理完成');
          this.setData({
            taskStatus: 'completed',
            isLoading: false
          });
          
          // 显示完成提示
          wx.showToast({
            title: '分析完成',
            icon: 'success'
          });
        }
        
      } else {
        console.error(`第${currentBatch + 1}批处理失败：`, res.result.error);
        
        // 检查是否是任务被停止
        if (res.result.status === 'stopped') {
          console.log('任务已被云函数停止');
          this.setData({
            isLoading: false,
            taskStatus: 'stopped'
          });
          wx.showToast({
            title: '分析已停止',
            icon: 'none'
          });
          return;
        }
        
        this.setData({
          isLoading: false,
          taskStatus: 'failed'
        });
        wx.showToast({
          title: '处理失败',
          icon: 'error'
        });
      }
    }).catch(error => {
      console.error(`调用云函数失败：`, error);
      this.setData({
        isLoading: false,
        taskStatus: 'failed'
      });
      wx.showToast({
        title: '网络错误',
        icon: 'error'
      });
    });
  },

  // 更新进度
  updateProgress: function(processed, total) {
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
    
    console.log(`更新进度：${processed}/${total} (${percentage}%)`);
    
    this.setData({
      progress: {
        processed: processed,
        total: total,
        percentage: percentage
      }
    });
    
    // 保存任务信息到本地存储
    this.saveTaskInfoToStorage();
  },



  // 计算总体评分（正确率）
  calculateOverallScore: function(results) {
    if (!results || results.length === 0) {
      return 0;
    }

    let correctCount = 0;
    let validResults = 0;

    results.forEach(result => {
      // 只统计有效分析的结果
      if (result.status === 'correct' || result.status === 'incorrect') {
        if (result.status === 'correct') {
          correctCount++;
        }
        validResults++;
      }
    });

    if (validResults === 0) {
      this.setData({ overallScore: 0, scoreDescription: '暂无有效评分' });
      return 0;
    }

    const accuracy = Math.round((correctCount / validResults) * 100);
    
    // 更新页面数据
    this.setData({
      overallScore: accuracy,
      scoreDescription: this.getScoreDescription(accuracy)
    });

    console.log(`计算正确率: ${correctCount} / ${validResults} = ${accuracy}%`);

    return accuracy;
  },

  // 显示结果
  displayResults: function(newResults, allResults = null) {
    // 如果提供了所有结果，使用所有结果；否则只添加新结果
    const resultsToDisplay = allResults || [...this.data.questionResults, ...newResults];
    
    // 处理结果数据
    const processedResults = this.processResults(resultsToDisplay);
    
    this.setData({
      questionResults: processedResults,
      itemCount: processedResults.length
    });

    // 计算总体评分
    this.calculateOverallScore(processedResults);
    
    // 保存任务信息到本地存储，以便upload页面可以检查
    this.saveTaskInfoToStorage();
  },

  // 保存任务信息到本地存储
  saveTaskInfoToStorage: function() {
    try {
      const taskInfo = {
        taskId: this.data.taskId,
        taskStatus: this.data.taskStatus,
        progress: this.data.progress,
        currentBatch: this.data.currentBatch,
        totalBatches: this.data.totalBatches,
        questionResults: this.data.questionResults,
        simpleFormatData: this.data.simpleFormatData,
        overallScore: this.data.overallScore,
        scoreDescription: this.data.scoreDescription,
        itemCount: this.data.itemCount,
        statistics: this.data.statistics,
        timestamp: Date.now()
      }
      
      wx.setStorageSync('ongoingTaskInfo', taskInfo)
      console.log('任务信息已保存到本地存储')
    } catch (error) {
      console.error('保存任务信息到本地存储失败:', error)
    }
  },

  // 处理结果数据
  processResults: function(results) {
    return results.map(result => {
      if (result.error) {
        // 处理错误结果
        return {
          id: result.segmentId,
          title: result.originalItem,
          question: result.originalItem,
          answer: result.originalItem,
          status: 'error',
          statusText: '分析失败',
          analysis: `分析失败：${result.error}`,
          itemAnalyses: [],
          spellingErrors: [],
          grammarErrors: [],
          correctAnswer: null,
          suggestion: '请重新检查或联系客服'
        };
      }

      // 处理正常结果
      const analysis = result.analysis || {};
      return {
        id: result.segmentId,
        title: result.originalItem,
        question: result.originalItem,
        answer: result.originalItem,
        status: analysis.isCorrect ? 'correct' : 'incorrect',
        statusText: analysis.isCorrect ? '正确' : '需要改进',
        analysis: analysis.analysis || '暂无分析',
        itemAnalyses: analysis.itemAnalyses || [],
        spellingErrors: analysis.spellingErrors || [],
        grammarErrors: analysis.grammarErrors || [],
        correctAnswer: analysis.correctAnswer || null,
        suggestion: analysis.suggestion || '请根据分析结果进行改进'
      };
    });
  },

  // 停止当前任务
  stopTask: function() {
    console.log('停止当前任务');
    
    wx.showModal({
      title: '确认停止',
      content: '确定要停止当前的AI分析吗？停止后将无法恢复当前进度。',
      confirmText: '停止',
      confirmColor: '#ff4d4f',
      cancelText: '继续',
      success: (res) => {
        if (res.confirm) {
          this.performStopTask();
        }
      }
    });
  },

  // 执行停止任务
  performStopTask: function() {
    console.log('执行停止任务');
    
    // 停止轮询
    this.stopPolling();
    
    // 如果有正在进行的任务，通知云函数停止
    if (this.data.taskId && this.data.taskStatus === 'processing') {
      this.notifyCloudFunctionToStop();
    }
    
    // 重置任务状态
    this.setData({
      taskStatus: 'stopped',
      isLoading: false,
      taskId: null,
      currentBatch: 0,
      totalBatches: 0,
      progress: {
        processed: 0,
        total: 0,
        percentage: 0
      }
    });
    
    // 保存任务信息到本地存储
    this.saveTaskInfoToStorage();
    
    // 显示停止提示
    wx.showToast({
      title: '分析已停止',
      icon: 'none',
      duration: 2000
    });
    
    // 如果有部分结果，可以保留显示
    if (this.data.questionResults.length > 0) {
      console.log('保留已分析的结果');
    }
  },

  // 重新检查
  recheck: function() {
    console.log('重新开始检查');
    
    // 重置状态
    this.setData({
      questionResults: [],
      overallScore: 0,
      scoreDescription: '',
      itemCount: 0,
      taskId: null,
      currentBatch: 0,
      totalBatches: 0,
      progress: {
        processed: 0,
        total: 0,
        percentage: 0
      }
    });

    // 重新开始分析
    this.startAnalysis();
  },

  // 停止轮询（清理资源）
  stopPolling: function() {
    // 清理定时器等资源
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    // 清理其他可能的定时器
    if (this.data.pollingInterval) {
      clearInterval(this.data.pollingInterval);
      this.setData({
        pollingInterval: null
      });
    }
  },

  // 通知云函数停止任务
  notifyCloudFunctionToStop: function() {
    console.log('通知云函数停止任务:', this.data.taskId);
    
    wx.cloud.callFunction({
      name: 'ai-analysis',
      data: {
        action: 'stopTask',
        taskId: this.data.taskId
      }
    }).then(res => {
      console.log('云函数停止任务响应:', res);
      if (res.result && res.result.success) {
        console.log('云函数任务已成功停止');
      } else {
        console.log('云函数停止任务响应:', res.result);
      }
    }).catch(error => {
      console.error('通知云函数停止任务失败:', error);
    });
  },

  // 获取评分描述
  getScoreDescription(score) {
    if (score >= 90) {
      return '优秀！继续保持'
    } else if (score >= 80) {
      return '良好，需要继续改进'
    } else if (score >= 70) {
      return '一般，需要更多练习'
    } else if (score >= 60) {
      return '及格，建议重新学习'
    } else {
      return '需要重新学习'
    }
  },

  // 查看项目详情
  viewItemDetail(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.questionResults[0].itemResults[index]
    
    if (item) {
      wx.showModal({
        title: `第${item.itemIndex}项详情`,
        content: `原始内容：${item.originalItem}\n\n分析：${item.analysis}\n\n建议：${item.suggestion}`,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  // 保存结果
  async saveResult() {
    try {
      wx.showLoading({ title: '保存中...' })
      
      // 准备保存到 result-save 云函数的数据
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
      
      // 调用 result-save 云函数保存分析结果
      const saveResult = await wx.cloud.callFunction({
        name: 'result-save',
        data: {
          action: 'saveResultData',
          data: analysisData
        }
      })
      
      if (saveResult.result && saveResult.result.success) {
        console.log('分析结果已保存到云函数，记录ID:', saveResult.result.recordId)
        
        // 同时保存到用户历史记录（可选）
        try {
          const historyData = {
            analysisRecordId: saveResult.result.recordId,
            score: this.data.overallScore,
            itemCount: this.data.itemCount,
            createTime: new Date(),
            simpleFormatData: this.data.simpleFormatData
          }
          
          await wx.cloud.database().collection('user_analysis_history').add({
            data: historyData
          })
          
          console.log('分析结果已同时保存到用户历史记录')
        } catch (historyError) {
          console.warn('保存到用户历史记录失败，但不影响主要保存:', historyError)
        }
        
        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 2000
        })
        
        // 更新页面状态
        this.setData({
          analysisRecordId: saveResult.result.recordId
        })
        
        // 清除upload页面的状态并跳转到history页面
        this.clearUploadStateAndNavigateToHistory()
        
      } else {
        throw new Error(saveResult.result?.error || '保存失败')
      }
      
    } catch (error) {
      wx.hideLoading()
      console.error('保存失败:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'error',
        duration: 2000
      })
    }
  },

  // 清除upload页面状态并跳转到history页面
  clearUploadStateAndNavigateToHistory() {
    try {
      // 清除upload页面的状态
      const uploadPage = getCurrentPages().find(page => page.route === 'pages/upload/upload')
      if (uploadPage) {
        uploadPage.resetToInitialState()
      }
      
      // 延迟跳转，让用户看到保存成功的提示
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/history/history'
        })
      }, 1500)
      
    } catch (error) {
      console.error('清除upload状态失败:', error)
      // 即使清除失败，也要跳转到history页面
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/history/history'
        })
      }, 1500)
    }
  },

  // 返回上一页
  goBack() {
    this.stopPolling()
    wx.navigateBack({
      delta: 1
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: `我的英语检查得分：${this.data.overallScore}分`,
      path: '/pages/result/result'
    }
  }
})
