const tournament = require('../../utils/tournament')
const share = require('../../utils/share')

Page({
  data: {
    currentTournament: null,
    activeTab: 'scorers', // scorers, discipline
    topScorers: [],
    disciplineStats: [],
    showEditModal: false,
    editPlayerName: '',
    editTarget: null,
    isAdmin: false,
    unregisteredGoalCount: 0
  },

  onLoad(options) {
    this.shareOptions = options || {}
    share.enableShareMenu()
  },

  async onShow() {
    try {
      await tournament.syncTournamentsFromCloud()
    } catch (error) {
      console.error('球员数据同步失败', error)
      wx.showToast({ title: '云同步失败', icon: 'none' })
    }
    share.applySharedTournament(this.shareOptions)
    this.shareOptions = null
    this.setData({ isAdmin: tournament.canManageTournaments() })
    this.loadData()
  },

  onShareAppMessage() {
    return share.buildAppMessage(this.data.currentTournament, {
      section: '射手榜与球员统计',
      pagePath: '/pages/players/players'
    })
  },

  onShareTimeline() {
    return share.buildTimeline(this.data.currentTournament, {
      section: '射手榜与球员统计'
    })
  },

  loadData() {
    const current = tournament.getCurrentTournament()
    if (!current) {
      this.setData({ currentTournament: null })
      return
    }

    const topScorers = tournament.getTopScorers(current)
    const disciplineStats = tournament.getDisciplineStats(current)
    const unregisteredGoalCount = tournament.getTournamentUnregisteredGoals(current)

    this.setData({
      currentTournament: current,
      topScorers,
      disciplineStats,
      unregisteredGoalCount
    })
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  openEditName(e) {
    if (!this.ensureAdmin()) return
    const item = e.currentTarget.dataset.item
    if (!item || !item.teamId) return

    this.setData({
      showEditModal: true,
      editPlayerName: item.playerName || '',
      editTarget: {
        teamId: item.teamId,
        playerId: item.playerId || null,
        playerNumber: item.playerNumber || ''
      }
    })
  },

  closeEditModal() {
    this.setData({ showEditModal: false, editPlayerName: '', editTarget: null })
  },

  onEditNameInput(e) {
    this.setData({ editPlayerName: (e.detail.value || '').trim() })
  },

  stopTap() {},

  confirmEditName() {
    if (!this.ensureAdmin()) return
    const { currentTournament, editPlayerName, editTarget } = this.data
    if (!currentTournament || !editTarget) return
    if (!editPlayerName) {
      wx.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }

    const result = tournament.updatePlayerDisplayName(currentTournament.id, {
      teamId: editTarget.teamId,
      playerId: editTarget.playerId,
      playerNumber: editTarget.playerNumber,
      newName: editPlayerName
    })

    if (result) {
      wx.showToast({ title: '已更新', icon: 'success' })
      this.closeEditModal()
      this.loadData()
    } else {
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  ensureAdmin() {
    if (this.data.isAdmin) return true
    wx.showToast({ title: '当前账号只有查看权限', icon: 'none' })
    return false
  }
})
