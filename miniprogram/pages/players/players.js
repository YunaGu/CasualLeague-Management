const tournament = require('../../utils/tournament')

Page({
  data: {
    currentTournament: null,
    activeTab: 'scorers', // scorers, discipline
    topScorers: [],
    disciplineStats: [],
    showEditModal: false,
    editPlayerName: '',
    editTarget: null
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const current = tournament.getCurrentTournament()
    if (!current) {
      this.setData({ currentTournament: null })
      return
    }

    const topScorers = tournament.getTopScorers(current)
    const disciplineStats = tournament.getDisciplineStats(current)

    this.setData({
      currentTournament: current,
      topScorers,
      disciplineStats
    })
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  openEditName(e) {
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
  }
})
