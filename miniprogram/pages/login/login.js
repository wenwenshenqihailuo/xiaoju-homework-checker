const app = getApp()

Page({
  data: {
    loading: false
  },

  onLoad() {
    // 检查是否已登录
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.openid) {
      this.navigateToHome()
    }
  },

  // 处理微信登录
  handleWechatLogin() {
    if (this.data.loading) return
    
    this.setData({ loading: true })
    
    wx.showLoading({
      title: '登录中...',
      mask: true
    })

    // 获取用户信息
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        console.log('用户信息获取成功:', res)
        this.loginWithCloud(res.userInfo)
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '登录失败',
          icon: 'error'
        })
        this.setData({ loading: false })
      }
    })
  },

  // 云开发登录
  async loginWithCloud(userInfo) {
    try {
      // 1. 获取openid
      const loginResult = await wx.cloud.callFunction({
        name: 'login'
      })
      
      const openid = loginResult.result.openid
      console.log('获取openid成功:', openid)

      // 2. 查询用户是否已存在
      const db = wx.cloud.database()
      const userCollection = db.collection('users')
      
      const userQuery = await userCollection.where({
        openid: openid
      }).get()

      let userData = null

      if (userQuery.data.length > 0) {
        // 用户已存在，更新信息
        userData = userQuery.data[0]
        await userCollection.doc(userData._id).update({
          data: {
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl,
            lastLoginTime: new Date(),
            updateTime: new Date()
          }
        })
        console.log('用户信息更新成功')
      } else {
        // 新用户，创建记录
        const newUser = {
          openid: openid,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          createTime: new Date(),
          lastLoginTime: new Date(),
          updateTime: new Date(),
          totalChecks: 0,
          totalScore: 0,
          studyDays: 0
        }
        
        const addResult = await userCollection.add({
          data: newUser
        })
        
        userData = {
          _id: addResult._id,
          ...newUser
        }
        console.log('新用户创建成功')
      }

      // 3. 保存用户信息到本地存储
      const localUserInfo = {
        _id: userData._id,
        openid: userData.openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        totalChecks: userData.totalChecks || 0,
        totalScore: userData.totalScore || 0,
        studyDays: userData.studyDays || 0,
        loginTime: new Date().getTime()
      }

      wx.setStorageSync('userInfo', localUserInfo)
      app.setUserInfo(localUserInfo)

      wx.hideLoading()
      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })

      // 跳转到首页
      this.navigateToHome()

    } catch (error) {
      console.error('云开发登录失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'error'
      })
      this.setData({ loading: false })
    }
  },

  // 跳转到首页
  navigateToHome() {
    wx.switchTab({
      url: '/pages/upload/upload'
    })
  },

  // 显示用户协议
  showUserAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '这里是用户协议内容...',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  // 显示隐私政策
  showPrivacyPolicy() {
    wx.showModal({
      title: '隐私政策',
      content: '这里是隐私政策内容...',
      showCancel: false,
      confirmText: '我知道了'
    })
  }
})
