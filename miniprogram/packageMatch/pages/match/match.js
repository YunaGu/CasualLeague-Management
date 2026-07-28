const tournament = require('../../../utils/tournament')
const share = require('../../../utils/share')

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
    eventIsSupplement: false,
    eventMinuteInput: '',
    showPenaltyModal: false,
    penaltyHomeShots: [],
    penaltyAwayShots: [],
    penaltyHomeCount: 0,
    penaltyAwayCount: 0,
    penaltyRule: '3+1+1+1',
    penaltyNote: '',
    elapsedText: '00:00',
    elapsedMinute: 1,
    isAdmin: false,
    unregisteredGoalCount: 0,
    unregisteredHomeGoalCount: 0,
    unregisteredAwayGoalCount: 0,
    showQuickScoreModal: false,
    quickHomeScore: 0,
    quickAwayScore: 0,
    quickHomePoints: 1,
    quickAwayPoints: 1,
    quickIsKnockout: false
  },

  onLoad(options) {
    this.shareOptions = options || {}
    this.setData({ matchId: (options && options.matchId) || '' })
    share.enableShareMenu()
  },

  async onShow() {
    try {
      await tournament.syncTournamentsFromCloud()
    } catch (error) {
      console.error('比赛数据同步失败', error)
      wx.showToast({ title: '云同步失败', icon: 'none' })
    }
    share.applySharedTournament(this.shareOptions)
    this.shareOptions = null
    this.setData({ isAdmin: tournament.canManageTournaments() })
    this.loadData()
    this.startTimerIfNeeded()
  },

  onShareAppMessage() {
    const { currentTournament, match, homeTeam, awayTeam } = this.data
    return share.buildAppMessage(currentTournament, {
      title: this.getMatchShareTitle(currentTournament, match, homeTeam, awayTeam),
      pagePath: '/packageMatch/pages/match/match',
      extraQuery: { matchId: this.data.matchId }
    })
  },

  onShareTimeline() {
    const { currentTournament, match, homeTeam, awayTeam } = this.data
    return share.buildTimeline(currentTournament, {
      title: this.getMatchShareTitle(currentTournament, match, homeTeam, awayTeam),
      extraQuery: { matchId: this.data.matchId }
    })
  },

  getMatchShareTitle(currentTournament, match, homeTeam, awayTeam) {
    const tournamentName = currentTournament ? currentTournament.name : '足球赛事'
    if (!match || !homeTeam || !awayTeam) return `${tournamentName}｜比赛详情`
    if (match.status === 'pending') {
      return `${tournamentName}｜${homeTeam.name} VS ${awayTeam.name}`
    }
    return `${tournamentName}｜${homeTeam.name} ${match.homeScore}:${match.awayScore} ${awayTeam.name}`
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
    const unregisteredGoals = tournament.getMatchUnregisteredGoals(match)

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
      events,
      unregisteredGoalCount: unregisteredGoals.total,
      unregisteredHomeGoalCount: unregisteredGoals.home,
      unregisteredAwayGoalCount: unregisteredGoals.away
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
    if (!this.ensureAdmin()) return
    const result = tournament.startMatch(this.data.currentTournament.id, this.data.matchId)
    if (result) {
      wx.showToast({ title: '比赛开始', icon: 'success' })
      this.loadData()
      this.startTimerIfNeeded()
    }
  },

  openQuickScore() {
    if (!this.ensureAdmin()) return
    const { match } = this.data
    if (!match || match.status === 'finished') return
    const homeScore = Number.isFinite(Number(match.homeScore)) ? Number(match.homeScore) : 0
    const awayScore = Number.isFinite(Number(match.awayScore)) ? Number(match.awayScore) : 0
    this.setData({
      showQuickScoreModal: true,
      quickHomeScore: homeScore,
      quickAwayScore: awayScore,
      quickIsKnockout: match.stage !== 'group'
    })
    this.updateQuickPoints(homeScore, awayScore)
  },

  closeQuickScore() {
    this.setData({ showQuickScoreModal: false })
  },

  onQuickScoreInput(e) {
    const side = e.currentTarget.dataset.side
    const value = e.detail.value
    if (side === 'home') {
      this.setData({ quickHomeScore: value })
    } else {
      this.setData({ quickAwayScore: value })
    }
    this.updateQuickPoints(
      side === 'home' ? value : this.data.quickHomeScore,
      side === 'away' ? value : this.data.quickAwayScore
    )
  },

  adjustQuickScore(e) {
    const side = e.currentTarget.dataset.side
    const delta = Number(e.currentTarget.dataset.delta) || 0
    const key = side === 'home' ? 'quickHomeScore' : 'quickAwayScore'
    const current = parseInt(this.data[key], 10) || 0
    const value = Math.max(0, Math.min(99, current + delta))
    this.setData({ [key]: value })
    this.updateQuickPoints(
      side === 'home' ? value : this.data.quickHomeScore,
      side === 'away' ? value : this.data.quickAwayScore
    )
  },

  updateQuickPoints(homeInput, awayInput) {
    const home = parseInt(homeInput, 10) || 0
    const away = parseInt(awayInput, 10) || 0
    let homePoints = 1
    let awayPoints = 1
    if (home > away) {
      homePoints = 3
      awayPoints = 0
    } else if (away > home) {
      homePoints = 0
      awayPoints = 3
    }
    this.setData({
      quickHomePoints: homePoints,
      quickAwayPoints: awayPoints
    })
  },

  saveQuickScore() {
    const result = this.persistQuickScore()
    if (!result) return
    this.closeQuickScore()
    this.loadData()
    this.startTimerIfNeeded()
    wx.showToast({ title: '比分已保存', icon: 'success' })
  },

  finishQuickScore() {
    const result = this.persistQuickScore()
    if (!result) return
    this.closeQuickScore()
    this.loadData()

    const { match } = this.data
    if (match.stage !== 'group' && match.homeScore === match.awayScore) {
      this.finishMatch()
      return
    }

    const finished = tournament.finishMatch(
      this.data.currentTournament.id,
      this.data.matchId
    )
    if (!finished) {
      wx.showToast({ title: '比赛结束失败', icon: 'none' })
      return
    }
    wx.showToast({ title: '比分已保存，比赛结束', icon: 'success' })
    this.loadData()
    this.clearTimer()
  },

  persistQuickScore() {
    const result = tournament.updateMatchScoreQuickly(
      this.data.currentTournament.id,
      this.data.matchId,
      this.data.quickHomeScore,
      this.data.quickAwayScore
    )
    if (result.ok) return result

    const title = result.reason === 'below-recorded-goals'
      ? `比分不能低于已登记进球（${result.recordedHomeGoals}:${result.recordedAwayGoals}）`
      : '请输入 0-99 的整数比分'
    wx.showToast({ title, icon: 'none', duration: 3000 })
    return null
  },

  switchToDetailedMode() {
    if (!this.ensureAdmin()) return
    wx.showModal({
      title: '切换到详细记录',
      content: '当前正式比分会保留。之后新增的进球事件会继续增加比分，之前未登记的进球不会自动分配给球员。',
      confirmText: '切换',
      success: (res) => {
        if (!res.confirm) return
        const result = tournament.setMatchScoreEntryMode(
          this.data.currentTournament.id,
          this.data.matchId,
          'detailed'
        )
        if (!result) {
          wx.showToast({ title: '切换失败', icon: 'none' })
          return
        }
        this.loadData()
      }
    })
  },

  reopenMatch() {
    if (!this.ensureAdmin()) return
    wx.showModal({
      title: '重新编辑比赛',
      content: '已有比分和事件会保留。若后续比赛已经开始，其对阵不会被自动更改。',
      confirmText: '重新编辑',
      success: (res) => {
        if (!res.confirm) return
        const result = tournament.reopenMatch(
          this.data.currentTournament.id,
          this.data.matchId
        )
        if (!result) {
          wx.showToast({ title: '重新打开失败', icon: 'none' })
          return
        }
        wx.showToast({ title: '已恢复编辑', icon: 'success' })
        this.loadData()
        this.startTimerIfNeeded()
      }
    })
  },

  // 结束比赛
  finishMatch() {
    if (!this.ensureAdmin()) return
    const { match } = this.data
    const isKnockout = match && match.stage !== 'group'
    const isDraw = match && match.homeScore === match.awayScore

    if (isKnockout && isDraw) {
      const homeShots = Array.isArray(match.penaltyHomeShots)
        ? [...match.penaltyHomeShots]
        : []
      const awayShots = Array.isArray(match.penaltyAwayShots)
        ? [...match.penaltyAwayShots]
        : []
      this.setData({
        showPenaltyModal: true,
        penaltyHomeShots: homeShots,
        penaltyAwayShots: awayShots,
        penaltyHomeCount: homeShots.filter(Boolean).length,
        penaltyAwayCount: awayShots.filter(Boolean).length,
        penaltyRule: match.penaltyRule || '3+1+1+1',
        penaltyNote: match.penaltyNote || ''
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
    if (!this.ensureAdmin()) return
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
    if (!this.ensureAdmin()) return
    const type = e.currentTarget.dataset.type || 'goal'
    const teamId = e.currentTarget.dataset.team
    const isSupplement = String(e.currentTarget.dataset.supplement || '') === '1'

    this.setData({
      showEventModal: true,
      eventType: type,
      eventTeamId: teamId,
      eventPlayerNumber: '',
      eventIsSupplement: isSupplement,
      eventMinuteInput: ''
    })
  },

  // 关闭弹窗
  closeEventModal() {
    this.setData({
      showEventModal: false,
      eventIsSupplement: false,
      eventMinuteInput: ''
    })
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

  onEventMinuteInput(e) {
    this.setData({ eventMinuteInput: (e.detail.value || '').trim() })
  },

  // 确认添加事件
  confirmEvent() {
    if (!this.ensureAdmin()) return
    const {
      eventType,
      eventTeamId,
      eventPlayerNumber,
      eventIsSupplement,
      eventMinuteInput,
      matchId,
      currentTournament,
      elapsedMinute
    } = this.data

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
    const supplementMinute = eventMinuteInput ? parseInt(eventMinuteInput, 10) : null
    if (
      eventIsSupplement &&
      eventMinuteInput &&
      (!Number.isFinite(supplementMinute) || supplementMinute < 1 || supplementMinute > 999)
    ) {
      wx.showToast({ title: '请输入正确的比赛分钟', icon: 'none' })
      return
    }

    const event = {
      type: eventType,
      teamId: eventTeamId,
      playerId: foundPlayer ? foundPlayer.id : null,
      playerNumber: String(eventPlayerNumber),
      playerName: foundPlayer ? foundPlayer.name : '',
      minute: eventIsSupplement ? supplementMinute : elapsedMinute
    }

    if (eventIsSupplement) {
      const supplemental = tournament.addSupplementalMatchEvent(
        currentTournament.id,
        matchId,
        event
      )
      if (!supplemental.ok) {
        const title = supplemental.reason === 'no-unregistered-goal'
          ? '该队没有待补录进球'
          : '补录失败'
        wx.showToast({ title, icon: 'none' })
        return
      }
      this.closeEventModal()
      this.loadData()
      const typeText = eventType === 'goal' ? '进球' : eventType === 'yellow' ? '黄牌' : '红牌'
      wx.showToast({ title: `${typeText}已补录，比分不变`, icon: 'none' })
      return
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
    if (!this.ensureAdmin()) return
    const eventId = e.currentTarget.dataset.eventId
    const isSupplement = String(e.currentTarget.dataset.supplement || '') === '1'
    wx.showModal({
      title: '确认删除',
      content: isSupplement
        ? '确定删除这条补录事件吗？正式比分不会改变。'
        : '确定要删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          if (isSupplement) {
            tournament.removeSupplementalMatchEvent(
              this.data.currentTournament.id,
              this.data.matchId,
              eventId
            )
          } else {
            tournament.removeMatchEvent(
              this.data.currentTournament.id,
              this.data.matchId,
              eventId
            )
          }
          this.loadData()
        }
      }
    })
  },

  ensureAdmin() {
    if (this.data.isAdmin) return true
    wx.showToast({ title: '当前账号只有查看权限', icon: 'none' })
    return false
  }
})
