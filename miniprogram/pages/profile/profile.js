const app = getApp()

Page({
  data: {
    userInfo: {}
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadUserInfo()
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({ userInfo })
    } else {
      // 未登录，跳转到登录页
      wx.redirectTo({
        url: '/pages/login/login'
      })
    }
  },

  // 显示设置
  showSettings() {
    wx.showToast({
      title: '设置功能开发中',
      icon: 'none'
    })
  },

  // 显示帮助
  showHelp() {
    wx.showModal({
      title: '帮助与反馈',
      content: '如有问题或建议，请联系我们：\n\n邮箱：support@aienglish.com\n微信：aienglish_support\n\n我们会尽快回复您！',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  // 显示关于我们
  showAbout() {
    wx.showModal({
      title: '关于我们',
      content: 'AI英语检查系统\n\n版本：v1.0.0\n\n我们致力于为学生提供智能、准确的英语作业检查服务，让英语学习更简单、更有效。\n\n感谢您的使用！',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          this.clearUserData()
        }
      }
    })
  },

  // 清除用户数据
  async clearUserData() {
    try {
      wx.showLoading({
        title: '退出中...',
        mask: true
      })

      // 清除本地存储
      wx.removeStorageSync('userInfo')
      wx.removeStorageSync('historyRecords')
      
      // 清除全局数据
      app.clearUserInfo()

      wx.hideLoading()
      wx.showToast({
        title: '已退出登录',
        icon: 'success'
      })

      // 跳转到登录页
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/login/login'
        })
      }, 1500)

    } catch (error) {
      console.error('退出登录失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '退出失败，请重试',
        icon: 'error'
      })
    }
  }
})
