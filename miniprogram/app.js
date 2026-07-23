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

    // 提前开始恢复缓存；页面 onShow 会等待同一个同步任务。
    this.cloudReady = tournament.syncTournamentsFromCloud()
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
