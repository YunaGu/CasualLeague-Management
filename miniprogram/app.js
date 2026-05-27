const tournament = require('./utils/tournament')

App({
  onLaunch() {
    console.log('足球赛事管理 App Launch')
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
