const tournament = require('../../utils/tournament')

Page({
  data: {
    currentTournament: null,
    tournaments: [],
    standings: null,
    recentMatches: [],
    nextMatches: []
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const tournaments = tournament.getTournaments()
    const current = tournament.getCurrentTournament()

    if (current) {
      const standings = tournament.calculateGroupStandings(current)
      const allMatches = current.matches || []

      // 最近完成的比赛（最后3场）
      const recentMatches = allMatches
        .filter(m => m.status === 'finished')
        .slice(-3)
        .reverse()
        .map(m => ({
          ...m,
          homeTeamName: tournament.getTeamName(current, m.homeTeam),
          awayTeamName: tournament.getTeamName(current, m.awayTeam)
        }))

      // 下一场待比赛
      const nextMatches = allMatches
        .filter(m => m.status === 'pending')
        .slice(0, 3)
        .map(m => ({
          ...m,
          homeTeamName: tournament.getTeamName(current, m.homeTeam),
          awayTeamName: tournament.getTeamName(current, m.awayTeam)
        }))

      this.setData({
        currentTournament: current,
        tournaments,
        standings,
        recentMatches,
        nextMatches
      })
    } else {
      this.setData({
        currentTournament: null,
        tournaments,
        standings: null,
        recentMatches: [],
        nextMatches: []
      })
    }
  },

  // 创建新赛事
  goCreate() {
    wx.navigateTo({ url: '/pages/create/create' })
  },

  // 切换赛事
  switchTournament(e) {
    const id = e.currentTarget.dataset.id
    tournament.setCurrentTournament(id)
    this.loadData()
    wx.showToast({ title: '已切换', icon: 'success' })
  },

  // 获取阶段文字
  getStageText(stage) {
    const map = {
      group: '小组赛阶段',
      semi: '半决赛阶段',
      third: '三四名决赛',
      final: '决赛阶段',
      finished: '已结束'
    }
    return map[stage] || stage
  }
})
