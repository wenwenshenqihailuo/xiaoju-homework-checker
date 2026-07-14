const app = getApp()

Page({
  data: {
    loading: false,
    hasAgreed: false
  },

  onLoad() {
    this.checkLoginStatus()
  },

  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo && userInfo.openid) {
      this.navigateToHome()
    }
  },

  handleWechatLogin() {
    if (this.data.loading) {
      return
    }

    if (!this.data.hasAgreed) {
      this.showAgreementRequired()
      return
    }

    this.setData({ loading: true })

    wx.showLoading({
      title: '登录中...',
      mask: true
    })

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

  async loginWithCloud(userInfo) {
    try {
      const loginResult = await wx.cloud.callFunction({
        name: 'login'
      })

      const openid = loginResult.result.openid
      console.log('获取openid成功:', openid)

      const db = wx.cloud.database()
      const userCollection = db.collection('users')

      const userQuery = await userCollection.where({
        openid
      }).get()

      let userData = null

      if (userQuery.data.length > 0) {
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
        const newUser = {
          openid,
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

  navigateToHome() {
    wx.switchTab({
      url: '/pages/upload/upload'
    })
  },

  handleAgreementChange(e) {
    const values = e.detail.value || []
    this.setData({
      hasAgreed: values.includes('agree')
    })
  },

  showAgreementRequired() {
    wx.showToast({
      title: '请先阅读并勾选协议',
      icon: 'none',
      duration: 2500
    })
  },

  showUserAgreement() {
    wx.showModal({
      title: '用户服务协议',
      content: '请在充分阅读并理解协议内容后，再自主选择是否同意并继续登录。',
      showCancel: false,
      confirmText: '我已阅读'
    })
  },

  showPrivacyPolicy() {
    wx.showModal({
      title: '隐私政策',
      content: '请在充分阅读并理解隐私政策内容后，自主选择是否同意。未勾选同意前，不会继续登录。',
      showCancel: false,
      confirmText: '我已阅读'
    })
  }
})
