const tournament = require('./utils/tournament')
const config = require('./config')

App({
  onLaunch() {
    console.log('足球赛事管理 App Launch')

    if (!wx.cloud) {
      console.error('当前基础库不支持云开发')
      return
    }

    const cloudOptions = { traceUser: true }
    if (config.cloudEnvId) {
      cloudOptions.env = config.cloudEnvId
    }
    wx.cloud.init(cloudOptions)

    // 先识别管理员身份，再恢复赛事缓存。
    this.cloudReady = tournament.loadAccessInfo()
      .then(() => tournament.syncTournamentsFromCloud())
      .catch(error => {
        console.error('赛事云端初始化失败', error)
        return tournament.getTournaments()
      })
  },

  globalData: {
    currentTournament: null
  },

  // 刷新当前赛事数据
  refreshTournament() {
    this.globalData.currentTournament = tournament.getCurrentTournament()
    return this.globalData.currentTournament
  }
})
