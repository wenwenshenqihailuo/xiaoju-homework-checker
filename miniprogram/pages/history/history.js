const app = getApp()

Page({
  data: {
    filteredRecords: [],
    hasMore: false,
    loading: false,
    page: 1,
    pageSize: 10
  },

  onLoad() {
    // 强行清理一次本地的兜底数据，以解决历史数据显示异常的问题
    try {
      wx.removeStorageSync('historyRecords');
      console.log('已强制清理本地历史记录缓存。');
    } catch (e) {
      console.error('清理本地缓存失败:', e);
    }
    this.loadHistoryData();
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadHistoryData()
  },

  // 加载历史数据
  async loadHistoryData() {
    try {
      this.setData({ loading: true })
      
      // 从云数据库加载历史记录
      const db = wx.cloud.database()
      const result = await db.collection('user_analysis_history')
        .orderBy('createTime', 'desc')
        .limit(this.data.pageSize)
        .get()
      
      if (result.data && result.data.length > 0) {
        console.log('从云数据库加载到历史记录:', result.data.length, '条')
        this.formatRecords(result.data)
      } else {
        console.log('没有找到历史记录')
        this.setData({
          filteredRecords: [],
          hasMore: false,
          loading: false
        })
      }
      
    } catch (error) {
      console.error('加载历史数据失败:', error)
      wx.showToast({
        title: '加载历史记录失败',
        icon: 'none'
      })
      this.setData({
        filteredRecords: [],
        hasMore: false,
        loading: false
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 格式化记录数据
  formatRecords(records) {
    const formattedRecords = records.map(record => {
      const createTime = new Date(record.createTime)
      const now = new Date()
      const diffTime = now - createTime
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      
      let timeText = ''
      if (diffDays === 0) {
        timeText = '今天 ' + createTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      } else if (diffDays === 1) {
        timeText = '昨天 ' + createTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      } else {
        timeText = createTime.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + 
                   createTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }

      // 确定分数等级 - 支持云数据库的字段名
      const score = record.overallScore || record.score || 0
      let scoreLevel = 'good'
      if (score >= 90) scoreLevel = 'excellent'
      else if (score >= 70) scoreLevel = 'good'
      else if (score >= 60) scoreLevel = 'average'
      else scoreLevel = 'poor'

      // 生成标题 - 支持云数据库的数据结构
      const title = this.generateTitle(record)

      return {
        id: record._id || record.id, // 云数据库使用 _id
        title: title,
        time: timeText,
        score: score,
        scoreLevel: scoreLevel,
        summary: this.generateSummary(record),
        questionCount: record.itemCount || (record.questions ? record.questions.length : 0),
        // 保存原始记录用于详情查看
        originalRecord: record
      }
    })

    this.setData({
      filteredRecords: formattedRecords,
      hasMore: formattedRecords.length >= this.data.pageSize
    })
  },

  // 生成标题
  generateTitle(record) {
    // 支持云数据库的数据结构
    if (record.simpleFormatData && record.simpleFormatData.length > 0) {
      return '英语作业检查'
    } else if (record.questionResults && record.questionResults.length > 0) {
      return '英语作业检查'
    } else if (record.questions && record.questions.length > 0) {
      const questionTypes = record.questions.map(q => {
        if (q.question.includes('capital')) return '地理知识'
        if (q.question.includes('days')) return '时间概念'
        if (q.question.includes('color')) return '颜色认知'
        return '英语练习'
      })
      
      // 去重并取最常见的类型
      const typeCount = {}
      questionTypes.forEach(type => {
        typeCount[type] = (typeCount[type] || 0) + 1
      })
      
      const mostCommonType = Object.keys(typeCount).reduce((a, b) => 
        typeCount[a] > typeCount[b] ? a : b
      )
      
      return mostCommonType + '检查'
    }
    
    return '英语作业检查'
  },

  // 生成摘要
  generateSummary(record) {
    if (record.simpleFormatData && record.simpleFormatData.length > 0) {
      return `检查了 ${record.itemCount || record.simpleFormatData.length} 项内容`
    } else if (record.questionResults && record.questionResults.length > 0) {
      return `检查了 ${record.questionResults.length} 个问题，共 ${record.itemCount || 0} 项内容`
    } else if (record.description) {
      return record.description
    } else {
      return '暂无描述'
    }
  },

  // 查看记录详情
  viewRecordDetail(e) {
    const record = e.currentTarget.dataset.record
    console.log('查看记录详情:', record)
    
    // 如果有原始记录，传递更多信息
    if (record.originalRecord) {
      const originalRecord = record.originalRecord
      
      // 跳转到结果页面，传递必要的参数
      if (originalRecord.analysisRecordId) {
        wx.navigateTo({
          url: `/pages/result/result?analysisRecordId=${originalRecord.analysisRecordId}&fromHistory=true`
        })
      } else if (originalRecord.taskId) {
        wx.navigateTo({
          url: `/pages/result/result?taskId=${originalRecord.taskId}&fromHistory=true`
        })
      } else {
        wx.navigateTo({
          url: `/pages/result/result?id=${record.id}&fromHistory=true`
        })
      }
    } else {
      wx.navigateTo({
        url: `/pages/result/result?id=${record.id}&fromHistory=true`
      })
    }
  },

  // 显示搜索
  showSearch() {
    wx.showToast({
      title: '搜索功能开发中',
      icon: 'none'
    })
  },

  // 开始检查
  startCheck() {
    wx.switchTab({
      url: '/pages/upload/upload'
    })
  },

  // 加载更多
  loadMore() {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    // 模拟加载更多
    setTimeout(() => {
      this.setData({ 
        loading: false,
        hasMore: false
      })
      
      wx.showToast({
        title: '已加载全部记录',
        icon: 'none'
      })
    }, 1000)
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadHistoryData();
    wx.stopPullDownRefresh();
  },

  // 删除记录（带后端逻辑）
  onDelete(e) {
    const { id } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '你确定要永久删除这条历史记录吗？此操作不可恢复。',
      confirmColor: '#e64340',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          try {
            const result = await wx.cloud.callFunction({
              name: 'result-save',
              data: {
                action: 'deleteAnalysisHistory',
                recordId: id
              }
            });

            if (result.result && result.result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              const newRecords = this.data.filteredRecords.filter(record => record.id !== id);
              this.setData({ filteredRecords: newRecords });
            } else {
              throw new Error(result.result.error || '删除失败');
            }
          } catch (error) {
            console.error('删除历史记录失败:', error);
            wx.showToast({ title: '删除失败，请重试', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  }
})
