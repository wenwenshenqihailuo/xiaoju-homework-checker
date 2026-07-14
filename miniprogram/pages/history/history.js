Page({
  data: {
    filteredRecords: [],
    hasMore: false,
    loading: false,
    page: 1,
    pageSize: 10
  },

  onLoad() {
    try {
      wx.removeStorageSync('historyRecords')
      console.log('已清理本地历史缓存')
    } catch (error) {
      console.error('清理本地缓存失败:', error)
    }

    this.loadHistoryData({ reset: true })
  },

  onShow() {
    this.loadHistoryData({ reset: true })
  },

  async loadHistoryData({ reset = false } = {}) {
    if (this.data.loading) {
      return
    }

    const nextPage = reset ? 1 : this.data.page + 1
    const offset = (nextPage - 1) * this.data.pageSize

    try {
      this.setData({ loading: true })

      const result = await wx.cloud.callFunction({
        name: 'result-save',
        data: {
          action: 'getAnalysisHistory',
          data: {
            limit: this.data.pageSize,
            offset
          }
        }
      })

      if (!result.result?.success) {
        throw new Error(result.result?.error || '加载历史记录失败')
      }

      const formattedRecords = this.formatRecords(result.result.data || [])
      const mergedRecords = reset
        ? formattedRecords
        : this.mergeRecords(this.data.filteredRecords, formattedRecords)

      this.setData({
        filteredRecords: mergedRecords,
        hasMore: !!result.result?.hasMore,
        page: nextPage
      })
    } catch (error) {
      console.error('loadHistoryData failed:', error)
      wx.showToast({
        title: '加载历史记录失败',
        icon: 'none'
      })

      if (reset) {
        this.setData({
          filteredRecords: [],
          hasMore: false,
          page: 1
        })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  formatRecords(records) {
    return records.map(record => {
      const createTime = new Date(record.createTime)
      const now = new Date()
      const diffTime = now - createTime
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

      let timeText = ''
      if (diffDays === 0) {
        timeText = `今天 ${createTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
      } else if (diffDays === 1) {
        timeText = `昨天 ${createTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
      } else {
        timeText = `${createTime.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${createTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
      }

      const score = record.overallScore || record.score || 0
      let scoreLevel = 'good'
      if (score >= 90) scoreLevel = 'excellent'
      else if (score >= 70) scoreLevel = 'good'
      else if (score >= 60) scoreLevel = 'average'
      else scoreLevel = 'poor'

      return {
        id: record._id || record.id,
        title: this.generateTitle(record),
        time: timeText,
        score,
        scoreLevel,
        summary: this.generateSummary(record),
        questionCount: record.itemCount || (record.questions ? record.questions.length : 0),
        originalRecord: record
      }
    })
  },

  mergeRecords(existingRecords, incomingRecords) {
    const recordMap = new Map()

    ;[...(existingRecords || []), ...(incomingRecords || [])].forEach(record => {
      if (record && record.id) {
        recordMap.set(record.id, record)
      }
    })

    return Array.from(recordMap.values())
  },

  generateTitle(record) {
    if (record.simpleFormatData && record.simpleFormatData.length > 0) {
      return '英语作业检查'
    }

    if (record.questionResults && record.questionResults.length > 0) {
      return '英语作业检查'
    }

    if (record.questions && record.questions.length > 0) {
      const questionTypes = record.questions.map(question => {
        if (question.question.includes('capital')) return '地理知识'
        if (question.question.includes('days')) return '时间概念'
        if (question.question.includes('color')) return '颜色认知'
        return '英语练习'
      })

      const typeCount = {}
      questionTypes.forEach(type => {
        typeCount[type] = (typeCount[type] || 0) + 1
      })

      const mostCommonType = Object.keys(typeCount).reduce((a, b) =>
        typeCount[a] > typeCount[b] ? a : b
      )

      return `${mostCommonType}检查`
    }

    return '英语作业检查'
  },

  generateSummary(record) {
    if (record.simpleFormatData && record.simpleFormatData.length > 0) {
      return `检查了 ${record.itemCount || record.simpleFormatData.length} 项内容`
    }

    if (record.questionResults && record.questionResults.length > 0) {
      return `检查了 ${record.questionResults.length} 个问题，共 ${record.itemCount || 0} 项内容`
    }

    if (record.description) {
      return record.description
    }

    return '暂无描述'
  },

  viewRecordDetail(e) {
    const record = e.currentTarget.dataset.record
    const originalRecord = record?.originalRecord || null

    if (!originalRecord) {
      wx.showToast({
        title: '记录信息缺失',
        icon: 'none'
      })
      return
    }

    if (originalRecord.analysisRecordId) {
      wx.navigateTo({
        url: `/pages/result/result?analysisRecordId=${originalRecord.analysisRecordId}&fromHistory=true`
      })
      return
    }

    if (originalRecord.taskId) {
      wx.navigateTo({
        url: `/pages/result/result?taskId=${originalRecord.taskId}&fromHistory=true`
      })
      return
    }

    wx.showToast({
      title: '该旧记录暂不支持查看详情',
      icon: 'none'
    })
  },

  showSearch() {
    wx.showToast({
      title: '搜索功能开发中',
      icon: 'none'
    })
  },

  startCheck() {
    wx.switchTab({
      url: '/pages/upload/upload'
    })
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) {
      return
    }

    this.loadHistoryData({ reset: false })
  },

  async onPullDownRefresh() {
    await this.loadHistoryData({ reset: true })
    wx.stopPullDownRefresh()
  },

  onDelete(e) {
    const { id } = e.currentTarget.dataset

    wx.showModal({
      title: '确认删除',
      content: '你确定要永久删除这条历史记录吗？此操作不可恢复。',
      confirmColor: '#e64340',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        wx.showLoading({ title: '删除中...', mask: true })
        try {
          const result = await wx.cloud.callFunction({
            name: 'result-save',
            data: {
              action: 'deleteAnalysisHistory',
              recordId: id
            }
          })

          if (!result.result?.success) {
            throw new Error(result.result?.error || '删除失败')
          }

          wx.showToast({ title: '删除成功', icon: 'success' })
          this.setData({
            filteredRecords: this.data.filteredRecords.filter(record => record.id !== id)
          })
        } catch (error) {
          console.error('delete history failed:', error)
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
