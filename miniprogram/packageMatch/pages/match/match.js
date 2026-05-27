const tournament = require('../../../utils/tournament')

Page({
  data: {
    matchId: '',
    match: null,
    currentTournament: null,
    homeTeam: null,
    awayTeam: null,
    events: [],
    showEventModal: false,
    eventType: 'goal', // goal, yellow, red
    eventTeamId: '',
    eventPlayerNumber: '',
    showPenaltyModal: false,
    penaltyHomeShots: [],
    penaltyAwayShots: [],
    penaltyHomeCount: 0,
    penaltyAwayCount: 0,
    penaltyRule: '3+1+1+1',
    penaltyNote: '',
    elapsedText: '00:00',
    elapsedMinute: 1
  },

  onLoad(options) {
    this.setData({ matchId: options.matchId })
  },

  onShow() {
    this.loadData()
    this.startTimerIfNeeded()
  },

  onHide() {
    this.clearTimer()
  },

  onUnload() {
    this.clearTimer()
  },

  loadData() {
    const current = tournament.getCurrentTournament()
    if (!current) return

    const match = current.matches.find(m => m.id === this.data.matchId)
    if (!match) return

    const homeTeam = current.teams.find(t => t.id === match.homeTeam)
    const awayTeam = current.teams.find(t => t.id === match.awayTeam)

    // 映射事件显示信息
    const events = (match.events || []).map(e => {
      const team = current.teams.find(t => t.id === e.teamId)
      const player = team ? team.players.find(p => p.id === e.playerId) : null
      const number = player ? player.number : (e.playerNumber || '')
      const name = player ? player.name : (e.playerName || '未登记球员')
      return {
        ...e,
        teamName: team ? team.name : '未知',
        playerName: name,
        playerNumber: number,
        icon: e.type === 'goal' ? '⚽' : e.type === 'yellow' ? '🟡' : '🔴'
      }
    })

    this.setData({
      currentTournament: current,
      match,
      homeTeam,
      awayTeam,
      events
    })

    this.updateElapsed(match)
  },

  // 阻止弹窗内点击冒泡到遮罩层
  noop() {},

  startTimerIfNeeded() {
    this.clearTimer()
    const { match } = this.data
    if (!match || match.status !== 'playing' || !match.startTime) return
    this.timer = setInterval(() => {
      this.updateElapsed(this.data.match)
    }, 1000)
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  updateElapsed(match) {
    if (!match || !match.startTime) {
      this.setData({ elapsedText: '00:00', elapsedMinute: 1 })
      return
    }

    const now = match.status === 'finished' && match.endTime ? match.endTime : Date.now()
    const elapsedMs = Math.max(0, now - match.startTime)
    const totalSeconds = Math.floor(elapsedMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const minuteForEvent = Math.max(1, minutes + 1)
    const text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

    this.setData({ elapsedText: text, elapsedMinute: minuteForEvent })
  },

  // 开始比赛
  startMatch() {
    const result = tournament.startMatch(this.data.currentTournament.id, this.data.matchId)
    if (result) {
      wx.showToast({ title: '比赛开始', icon: 'success' })
      this.loadData()
      this.startTimerIfNeeded()
    }
  },

  // 结束比赛
  finishMatch() {
    const { match } = this.data
    const isKnockout = match && match.stage !== 'group'
    const isDraw = match && match.homeScore === match.awayScore

    if (isKnockout && isDraw) {
      this.setData({
        showPenaltyModal: true,
        penaltyHomeShots: [],
        penaltyAwayShots: [],
        penaltyHomeCount: 0,
        penaltyAwayCount: 0,
        penaltyRule: '3+1+1+1',
        penaltyNote: ''
      })
      return
    }

    wx.showModal({
      title: '确认结束',
      content: '确定要结束这场比赛吗？',
      success: (res) => {
        if (res.confirm) {
          const result = tournament.finishMatch(this.data.currentTournament.id, this.data.matchId)
          if (result) {
            wx.showToast({ title: '比赛结束', icon: 'success' })
            this.loadData()
            this.clearTimer()
          }
        }
      }
    })
  },

  closePenaltyModal() {
    this.setData({ showPenaltyModal: false })
  },

  addPenaltyShot(e) {
    const team = e.currentTarget.dataset.team
    const success = e.currentTarget.dataset.success === '1'
    if (team === 'home') {
      const shots = [...this.data.penaltyHomeShots, success]
      const count = shots.filter(Boolean).length
      this.setData({ penaltyHomeShots: shots, penaltyHomeCount: count })
    } else {
      const shots = [...this.data.penaltyAwayShots, success]
      const count = shots.filter(Boolean).length
      this.setData({ penaltyAwayShots: shots, penaltyAwayCount: count })
    }
  },

  undoPenaltyShot(e) {
    const team = e.currentTarget.dataset.team
    if (team === 'home') {
      const shots = [...this.data.penaltyHomeShots]
      shots.pop()
      const count = shots.filter(Boolean).length
      this.setData({ penaltyHomeShots: shots, penaltyHomeCount: count })
    } else {
      const shots = [...this.data.penaltyAwayShots]
      shots.pop()
      const count = shots.filter(Boolean).length
      this.setData({ penaltyAwayShots: shots, penaltyAwayCount: count })
    }
  },

  onPenaltyRuleInput(e) {
    this.setData({ penaltyRule: (e.detail.value || '').trim() || '3+1+1+1' })
  },

  onPenaltyNoteInput(e) {
    this.setData({ penaltyNote: (e.detail.value || '').trim() })
  },

  confirmPenaltyFinish() {
    const {
      currentTournament,
      matchId,
      penaltyHomeShots,
      penaltyAwayShots,
      penaltyHomeCount,
      penaltyAwayCount,
      penaltyRule,
      penaltyNote
    } = this.data

    const home = penaltyHomeCount
    const away = penaltyAwayCount

    if (penaltyHomeShots.length === 0 || penaltyAwayShots.length === 0) {
      wx.showToast({ title: '请至少记录每队1脚点球', icon: 'none' })
      return
    }

    if (Math.abs(penaltyHomeShots.length - penaltyAwayShots.length) > 1) {
      wx.showToast({ title: '两队点球脚数差距过大', icon: 'none' })
      return
    }

    if (home === away) {
      wx.showToast({ title: '点球比分不能相同', icon: 'none' })
      return
    }

    const result = tournament.finishMatch(currentTournament.id, matchId, {
      penaltyHomeScore: home,
      penaltyAwayScore: away,
      penaltyHomeShots,
      penaltyAwayShots,
      penaltyRule: penaltyRule || '3+1+1+1',
      penaltyNote
    })

    if (result) {
      this.setData({ showPenaltyModal: false })
      wx.showToast({ title: '点球已记录，比赛结束', icon: 'success' })
      this.loadData()
      this.clearTimer()
    } else {
      wx.showToast({ title: '点球结果保存失败', icon: 'none' })
    }
  },

  // 打开事件记录弹窗
  openEventModal(e) {
    const type = e.currentTarget.dataset.type || 'goal'
    const teamId = e.currentTarget.dataset.team

    this.setData({
      showEventModal: true,
      eventType: type,
      eventTeamId: teamId,
      eventPlayerNumber: ''
    })
  },

  // 关闭弹窗
  closeEventModal() {
    this.setData({ showEventModal: false })
  },

  // 选择事件类型
  onEventTypeChange(e) {
    this.setData({ eventType: e.currentTarget.dataset.type })
  },

  // 选择球队
  onTeamSelect(e) {
    const teamId = e.currentTarget.dataset.team
    this.setData({ eventTeamId: teamId })
  },

  // 输入球员号码
  onPlayerNumberInput(e) {
    this.setData({ eventPlayerNumber: (e.detail.value || '').trim() })
  },

  // 确认添加事件
  confirmEvent() {
    const { eventType, eventTeamId, eventPlayerNumber, matchId, currentTournament, elapsedMinute } = this.data

    if (!eventTeamId) {
      wx.showToast({ title: '请选择球队', icon: 'none' })
      return
    }
    if (!eventPlayerNumber) {
      wx.showToast({ title: '请输入球员号码', icon: 'none' })
      return
    }

    const team = currentTournament.teams.find(t => t.id === eventTeamId)
    const foundPlayer = team ? (team.players || []).find(p => String(p.number) === String(eventPlayerNumber)) : null

    const event = {
      type: eventType,
      teamId: eventTeamId,
      playerId: foundPlayer ? foundPlayer.id : null,
      playerNumber: String(eventPlayerNumber),
      playerName: foundPlayer ? foundPlayer.name : '',
      minute: elapsedMinute
    }

    const result = tournament.addMatchEvent(currentTournament.id, matchId, event)
    if (result) {
      this.closeEventModal()
      this.loadData()
      const typeText = eventType === 'goal' ? '进球' : eventType === 'yellow' ? '黄牌' : '红牌'
      wx.showToast({ title: `${typeText}已记录`, icon: 'success' })
    }
  },

  // 删除事件
  removeEvent(e) {
    const eventId = e.currentTarget.dataset.eventId
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          tournament.removeMatchEvent(this.data.currentTournament.id, this.data.matchId, eventId)
          this.loadData()
        }
      }
    })
  }
})
