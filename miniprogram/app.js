// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'orange-homework-judgment-ac140c7',
        traceUser: true,
      })
      console.log('云开发初始化成功')
    }

    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
        console.log('微信登录成功:', res.code)
      }
    })
  },

  onShow() {
    // 小程序显示时的处理
  },

  onHide() {
    // 小程序隐藏时的处理
  },

  globalData: {
    userInfo: null,
    version: '1.0.0',
    appName: 'AI英语检查'
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    return !!userInfo
  },

  // 获取用户信息
  getUserInfo() {
    return wx.getStorageSync('userInfo') || null
  },

  // 设置用户信息
  setUserInfo(userInfo) {
    wx.setStorageSync('userInfo', userInfo)
    this.globalData.userInfo = userInfo
  },

  // 清除用户信息
  clearUserInfo() {
    wx.removeStorageSync('userInfo')
    this.globalData.userInfo = null
  }
})
