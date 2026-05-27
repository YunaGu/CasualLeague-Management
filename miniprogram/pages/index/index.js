const tournament = require('../../utils/tournament')

Page({
  data: {
    currentTournament: null,
    tournaments: [],
    standings: null,
    recentMatches: [],
    nextMatches: [],
    currentStageText: ''
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
      const currentStageText = this.getCurrentStageText(current)

      // 最近完成的比赛（最后3场）
      const recentMatches = allMatches
        .filter(m => m.status === 'finished')
        .slice(-3)
        .reverse()
        .map(m => ({
          ...m,
          stageLabel: this.getMatchStageLabel(current, m),
          homeTeamName: tournament.getTeamName(current, m.homeTeam),
          awayTeamName: tournament.getTeamName(current, m.awayTeam)
        }))

      // 下一场待比赛
      const nextMatches = allMatches
        .filter(m => m.status === 'pending')
        .slice(0, 3)
        .map(m => ({
          ...m,
          stageLabel: this.getMatchStageLabel(current, m),
          homeTeamName: tournament.getTeamName(current, m.homeTeam),
          awayTeamName: tournament.getTeamName(current, m.awayTeam)
        }))

      this.setData({
        currentTournament: current,
        tournaments,
        standings,
        recentMatches,
        nextMatches,
        currentStageText
      })
    } else {
      this.setData({
        currentTournament: null,
        tournaments,
        standings: null,
        recentMatches: [],
        nextMatches: [],
        currentStageText: ''
      })
    }
  },

  getCurrentStageText(currentTournament) {
    const templateConfig = currentTournament.templateConfig || {
      useGroups: !!(currentTournament.groups && currentTournament.groups.length >= 2),
      enableKnockout: !!(currentTournament.groups && currentTournament.groups.length >= 2)
    }

    if (currentTournament.stage === 'group') {
      return templateConfig.useGroups ? '小组赛' : '联赛'
    }

    if (currentTournament.stage === 'finished' && !templateConfig.enableKnockout) {
      return '联赛结束'
    }

    return this.getStageText(currentTournament.stage)
  },

  getMatchStageLabel(currentTournament, match) {
    if (match.stage === 'group') {
      return match.group === '总榜' ? '联赛' : `${match.group}组`
    }
    return match.matchLabel || match.stage
  },

  // 创建新赛事
  goCreate() {
    wx.navigateTo({ url: '/packageMatch/pages/create/create' })
  },

  goTemplate() {
    wx.navigateTo({ url: '/packageMatch/pages/template/template' })
  },

  // 切换赛事
  switchTournament(e) {
    const id = e.currentTarget.dataset.id
    tournament.setCurrentTournament(id)
    this.loadData()
    wx.showToast({ title: '已切换', icon: 'success' })
  },

  // 删除赛事
  deleteTournament(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    wx.showModal({
      title: '删除赛事',
      content: `确定要删除"${name}"吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#e53935',
      success: (res) => {
        if (res.confirm) {
          tournament.deleteTournament(id)
          this.loadData()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
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
