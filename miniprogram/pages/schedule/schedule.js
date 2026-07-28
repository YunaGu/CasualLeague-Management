const tournament = require('../../utils/tournament')
const share = require('../../utils/share')

Page({
  data: {
    currentTournament: null,
    activeTab: 'group', // group, knockout
    groupStageTitle: '小组赛',
    groupMatches: [],
    knockoutMatches: [],
    currentRound: 0,
    rounds: [],
    hasKnockout: false,
    isAdmin: false,
    showQuickScoreModal: false,
    quickMatchId: '',
    quickHomeTeamName: '',
    quickAwayTeamName: '',
    quickHomeScore: 0,
    quickAwayScore: 0,
    quickHomePoints: 1,
    quickAwayPoints: 1,
    quickIsKnockout: false
  },

  onLoad(options) {
    this.shareOptions = options || {}
    share.enableShareMenu()
  },

  async onShow() {
    try {
      await tournament.syncTournamentsFromCloud()
    } catch (error) {
      console.error('赛程同步失败', error)
      wx.showToast({ title: '云同步失败', icon: 'none' })
    }
    share.applySharedTournament(this.shareOptions)
    this.shareOptions = null
    this.setData({ isAdmin: tournament.canManageTournaments() })
    this.loadData()
  },

  onShareAppMessage() {
    return share.buildAppMessage(this.data.currentTournament, {
      section: '完整赛程与实时比分',
      pagePath: '/pages/schedule/schedule'
    })
  },

  onShareTimeline() {
    return share.buildTimeline(this.data.currentTournament, {
      section: '完整赛程与实时比分'
    })
  },

  loadData() {
    const current = tournament.getCurrentTournament()
    if (!current) {
      this.setData({ currentTournament: null })
      return
    }

    const allMatches = current.matches || []
    const venueOrderMap = this.getVenueOrderMap(current)
    const templateConfig = current.templateConfig || {
      useGroups: !!(current.groups && current.groups.length >= 2),
      enableKnockout: !!(current.groups && current.groups.length >= 2)
    }

    // 小组赛按轮次分组
    const groupMatchesRaw = allMatches.filter(m => m.stage === 'group')
    const roundMap = {}
    groupMatchesRaw.forEach(m => {
      if (!roundMap[m.round]) roundMap[m.round] = []
      roundMap[m.round].push({
        ...m,
        matchNo: m.templateMatchId != null ? m.templateMatchId : null,
        groupLabel: !m.group || m.group === '总榜' ? '联赛' : `${m.group}组`,
        homeTeamName: this.getDisplayTeamName(m, 'home', current),
        awayTeamName: this.getDisplayTeamName(m, 'away', current),
        scheduleText: this.getScheduleText(m, current),
        penaltyText: this.getPenaltyText(m),
        eventPreview: this.getEventPreview(m, current)
      })
    })
    const rounds = Object.keys(roundMap)
      .map(r => parseInt(r, 10))
      .sort((a, b) => {
        const aStart = this.getRoundStartMinute(roundMap[a])
        const bStart = this.getRoundStartMinute(roundMap[b])
        if (aStart !== bStart) return aStart - bStart
        return a - b
      })
    const groupMatches = rounds.map(r => ({
      round: r,
      matches: roundMap[r].sort((a, b) => this.compareMatchesBySchedule(a, b, venueOrderMap))
    }))

    // 淘汰赛
    const knockoutMatchesRaw = allMatches.filter(m => m.stage !== 'group')
    let knockoutMatches = knockoutMatchesRaw.map(m => ({
      ...m,
      matchNo: m.templateMatchId != null ? m.templateMatchId : null,
      homeTeamName: this.getDisplayTeamName(m, 'home', current),
      awayTeamName: this.getDisplayTeamName(m, 'away', current),
      scheduleText: this.getScheduleText(m, current),
      penaltyText: this.getPenaltyText(m),
      eventPreview: this.getEventPreview(m, current)
    }))

    knockoutMatches = this.mergeKnockoutWithPreview(current, knockoutMatches, venueOrderMap)

    const hasKnockout = knockoutMatches.length > 0

    // 仅在首次加载时设置 activeTab，避免从编辑页返回时重置 tab
    const currentTab = this.data.activeTab
    const isFirstLoad = !this.data.currentTournament
    const newTab = isFirstLoad
      ? (hasKnockout && current.stage !== 'group' ? 'knockout' : 'group')
      : currentTab

    this.setData({
      currentTournament: current,
      groupMatches,
      knockoutMatches,
      rounds,
      hasKnockout,
      activeTab: newTab,
      groupStageTitle: templateConfig.useGroups ? '小组赛' : '联赛'
    })
  },

  // 切换标签
  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  buildKnockoutPreview(currentTournament, realKnockoutMatches) {
    const templateConfig = currentTournament ? (currentTournament.templateConfig || {
      enableKnockout: !!(currentTournament.groups && currentTournament.groups.length >= 2)
    }) : null

    if (!currentTournament || !templateConfig || !templateConfig.enableKnockout) {
      return []
    }

    if (!currentTournament.groups || currentTournament.groups.length < 2) {
      return []
    }

    const realMatches = Array.isArray(realKnockoutMatches) ? realKnockoutMatches : []
    const cfg = currentTournament.scheduleConfig || {}
    const venues = Array.isArray(cfg.venues) && cfg.venues.length > 0
      ? cfg.venues
      : [{ id: 'venue_1', name: '1号场' }]
    const breakMinutes = Number.isFinite(parseInt(cfg.breakMinutes, 10)) ? parseInt(cfg.breakMinutes, 10) : 3
    const defaultDuration = Number.isFinite(parseInt(cfg.knockoutMatchMinutes, 10)) ? parseInt(cfg.knockoutMatchMinutes, 10) : 20
    const previewEdits = currentTournament.previewScheduleEdits || {}
    const teamCount = currentTournament.teamCount || ((currentTournament.teams || []).length)

    const allGroupMatches = (currentTournament.matches || []).filter(m => m.stage === 'group')
    const latestGroupEnd = this.getLatestEndMinute(allGroupMatches)
    const baseStart = latestGroupEnd == null ? null : latestGroupEnd + breakMinutes
    const slot = (start, step = 1) => (start == null ? null : start + step * (defaultDuration + breakMinutes))

    const previewMatches = []
    const pushPreview = ({ id, stage, matchLabel, homeTeamName, awayTeamName, defaultStartMinute, defaultVenue, fallbackText }) => {
      previewMatches.push({
        id,
        preview: true,
        stage,
        matchLabel,
        homeTeamName,
        awayTeamName,
        status: 'preview',
        ...this.buildPreviewScheduleFields({
          edit: previewEdits[id],
          defaultStartMinute,
          defaultDuration,
          defaultVenue,
          fallbackText
        }),
        penaltyText: '',
        eventPreview: { items: [], more: 0 }
      })
    }

    if (teamCount === 10) {
      pushPreview({
        id: 'preview-final',
        stage: 'final',
        matchLabel: '冠亚军决赛（预览）',
        homeTeamName: 'A1（待定）',
        awayTeamName: 'B1（待定）',
        defaultStartMinute: baseStart,
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-third',
        stage: 'third',
        matchLabel: '三四名决赛（预览）',
        homeTeamName: 'A2（待定）',
        awayTeamName: 'B2（待定）',
        defaultStartMinute: slot(baseStart, 1),
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-fifth',
        stage: 'fifth',
        matchLabel: '五六名排位赛（预览）',
        homeTeamName: 'A3（待定）',
        awayTeamName: 'B3（待定）',
        defaultStartMinute: slot(baseStart, 2),
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-seventh',
        stage: 'seventh',
        matchLabel: '七八名排位赛（预览）',
        homeTeamName: 'A4（待定）',
        awayTeamName: 'B4（待定）',
        defaultStartMinute: slot(baseStart, 3),
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-ninth',
        stage: 'ninth',
        matchLabel: '九十名排位赛（预览）',
        homeTeamName: 'A5（待定）',
        awayTeamName: 'B5（待定）',
        defaultStartMinute: slot(baseStart, 4),
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      return previewMatches
    }

    if (teamCount === 8) {
      const place5SemiStart = baseStart
      const semiStart = slot(place5SemiStart, 1)
      const finalSlotStart = slot(semiStart, 1)

      pushPreview({
        id: 'preview-place5semi-1',
        stage: 'place5semi',
        matchLabel: '5-8名排位赛1（预览）',
        awayTeamName: 'B4（待定）',
        defaultStartMinute: place5SemiStart,
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-place5semi-2',
        stage: 'place5semi',
        matchLabel: '5-8名排位赛2（预览）',
        homeTeamName: 'B3（待定）',
        awayTeamName: 'A4（待定）',
        defaultStartMinute: place5SemiStart,
        defaultVenue: venues[1] || venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-semi-1',
        stage: 'semi',
        matchLabel: '半决赛1（预览）',
        homeTeamName: 'A1（待定）',
        awayTeamName: 'B2（待定）',
        defaultStartMinute: semiStart,
        defaultVenue: venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-semi-2',
        stage: 'semi',
        matchLabel: '半决赛2（预览）',
        homeTeamName: 'B1（待定）',
        awayTeamName: 'A2（待定）',
        defaultStartMinute: semiStart,
        defaultVenue: venues[1] || venues[0],
        fallbackText: '小组赛结束后生成，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-fifth',
        stage: 'fifth',
        matchLabel: '五六名决赛（预览）',
        homeTeamName: '5-8名排位赛1胜者',
        awayTeamName: '5-8名排位赛2胜者',
        defaultStartMinute: finalSlotStart,
        defaultVenue: venues[0],
        fallbackText: '5-8名排位赛结束后确定，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-seventh',
        stage: 'seventh',
        matchLabel: '七八名决赛（预览）',
        homeTeamName: '5-8名排位赛1负者',
        awayTeamName: '5-8名排位赛2负者',
        defaultStartMinute: finalSlotStart,
        defaultVenue: venues[1] || venues[0],
        fallbackText: '5-8名排位赛结束后确定，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-third',
        stage: 'third',
        matchLabel: '三四名决赛（预览）',
        homeTeamName: '半决赛1负者',
        awayTeamName: '半决赛2负者',
        defaultStartMinute: slot(finalSlotStart, 1),
        defaultVenue: venues[0],
        fallbackText: '半决赛结束后确定，可手动编辑排程'
      })
      pushPreview({
        id: 'preview-final',
        stage: 'final',
        matchLabel: '冠亚军决赛（预览）',
        homeTeamName: '半决赛1胜者',
        awayTeamName: '半决赛2胜者',
        defaultStartMinute: slot(finalSlotStart, 1),
        defaultVenue: venues[1] || venues[0],
        fallbackText: '半决赛结束后确定，可手动编辑排程'
      })
      return previewMatches
    }

    const fifthStartBase = baseStart
    const semiStartBase = slot(fifthStartBase, 1)
    const finalSlotStart = slot(semiStartBase, 1)

    pushPreview({
      id: 'preview-fifth',
      stage: 'fifth',
      matchLabel: '五六名排位赛（预览）',
      homeTeamName: 'A3（待定）',
      awayTeamName: 'B3（待定）',
      defaultStartMinute: fifthStartBase,
      defaultVenue: venues[0],
      fallbackText: '小组赛结束后生成，可手动编辑排程'
    })
    pushPreview({
      id: 'preview-semi-1',
      stage: 'semi',
      matchLabel: '半决赛1（预览）',
      homeTeamName: 'A1（待定）',
      awayTeamName: 'B2（待定）',
      defaultStartMinute: semiStartBase,
      defaultVenue: venues[0],
      fallbackText: '小组赛结束后生成，可手动编辑排程'
    })
    pushPreview({
      id: 'preview-semi-2',
      stage: 'semi',
      matchLabel: '半决赛2（预览）',
      homeTeamName: 'B1（待定）',
      awayTeamName: 'A2（待定）',
      defaultStartMinute: semiStartBase,
      defaultVenue: venues[1] || venues[0],
      fallbackText: '小组赛结束后生成，可手动编辑排程'
    })
    pushPreview({
      id: 'preview-third',
      stage: 'third',
      matchLabel: '三四名决赛（预览）',
      homeTeamName: '半决赛1负者',
      awayTeamName: '半决赛2负者',
      defaultStartMinute: finalSlotStart,
      defaultVenue: venues[0],
      fallbackText: '半决赛结束后确定，可手动编辑排程'
    })
    pushPreview({
      id: 'preview-final',
      stage: 'final',
      matchLabel: '冠亚军决赛（预览）',
      homeTeamName: '半决赛1胜者',
      awayTeamName: '半决赛2胜者',
      defaultStartMinute: finalSlotStart,
      defaultVenue: venues[1] || venues[0],
      fallbackText: '半决赛结束后确定，可手动编辑排程'
    })

    return previewMatches
  },

  buildPreviewScheduleFields({ edit, defaultStartMinute, defaultDuration, defaultVenue, fallbackText }) {
    const durationFromEdit = edit && edit.durationMinutes != null ? parseInt(edit.durationMinutes, 10) : NaN
    const duration = Number.isFinite(durationFromEdit) && durationFromEdit > 0
      ? durationFromEdit
      : defaultDuration

    const startMinuteFromEdit = edit && edit.startTimeText
      ? this.parseTimeToMinutesLocal(edit.startTimeText)
      : null
    const startMinute = startMinuteFromEdit != null ? startMinuteFromEdit : defaultStartMinute

    const venueName = (edit && edit.venueName) || (defaultVenue && defaultVenue.name) || ''
    const venueId = (edit && edit.venueId) || (defaultVenue && defaultVenue.id) || ''

    if (!Number.isFinite(startMinute)) {
      return {
        venueId,
        venueName,
        startMinute: null,
        endMinute: null,
        startTimeText: '',
        endTimeText: '',
        scheduleText: fallbackText
      }
    }

    const endMinute = startMinute + duration
    const startTimeText = this.formatMinutesLocal(startMinute)
    const endTimeText = this.formatMinutesLocal(endMinute)
    const scheduleParts = [`${startTimeText}-${endTimeText}`, `${duration}分钟`]
    if (venueName) scheduleParts.push(venueName)

    return {
      venueId,
      venueName,
      startMinute,
      endMinute,
      startTimeText,
      endTimeText,
      scheduleText: scheduleParts.join(' · ')
    }
  },

  parseTimeToMinutesLocal(text) {
    if (!text || typeof text !== 'string') return null
    const matched = text.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!matched) return null
    const hour = parseInt(matched[1], 10)
    const minute = parseInt(matched[2], 10)
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return hour * 60 + minute
  },

  formatMinutesLocal(total) {
    const hour = Math.floor(total / 60)
    const minute = total % 60
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  },

  getLatestEndMinute(matches) {
    if (!Array.isArray(matches) || matches.length === 0) return null
    const list = matches
      .map(m => m.endMinute)
      .filter(v => typeof v === 'number')
    if (list.length === 0) return null
    return Math.max(...list)
  },

  getVenueOrderMap(currentTournament) {
    const map = {}
    const venues = (currentTournament && currentTournament.scheduleConfig && currentTournament.scheduleConfig.venues) || []
    venues.forEach((venue, index) => {
      if (venue && venue.id) map[venue.id] = index
      if (venue && venue.name && map[venue.name] == null) map[venue.name] = index
    })
    return map
  },

  getRoundStartMinute(matches) {
    if (!Array.isArray(matches) || matches.length === 0) return Number.MAX_SAFE_INTEGER
    const startMinutes = matches
      .map(m => m.startMinute)
      .filter(v => typeof v === 'number')
    if (startMinutes.length === 0) return Number.MAX_SAFE_INTEGER
    return Math.min(...startMinutes)
  },

  getVenueOrderIndex(match, venueOrderMap) {
    if (!match || !venueOrderMap) return Number.MAX_SAFE_INTEGER
    if (match.venueId && venueOrderMap[match.venueId] != null) return venueOrderMap[match.venueId]
    if (match.venueName && venueOrderMap[match.venueName] != null) return venueOrderMap[match.venueName]
    return Number.MAX_SAFE_INTEGER
  },

  compareMatchesBySchedule(a, b, venueOrderMap) {
    const aStart = typeof a.startMinute === 'number' ? a.startMinute : Number.MAX_SAFE_INTEGER
    const bStart = typeof b.startMinute === 'number' ? b.startMinute : Number.MAX_SAFE_INTEGER
    if (aStart !== bStart) return aStart - bStart

    const aVenue = this.getVenueOrderIndex(a, venueOrderMap)
    const bVenue = this.getVenueOrderIndex(b, venueOrderMap)
    if (aVenue !== bVenue) return aVenue - bVenue

    const aRound = typeof a.round === 'number' ? a.round : Number.MAX_SAFE_INTEGER
    const bRound = typeof b.round === 'number' ? b.round : Number.MAX_SAFE_INTEGER
    if (aRound !== bRound) return aRound - bRound

    return String(a.id || '').localeCompare(String(b.id || ''))
  },

  mergeKnockoutWithPreview(currentTournament, realKnockoutMatches, venueOrderMap) {
    const realMatches = Array.isArray(realKnockoutMatches) ? realKnockoutMatches : []
    const previewTemplate = this.buildKnockoutPreview(currentTournament, realMatches)

    if (previewTemplate.length === 0) return realMatches

    const expectedCounts = {}
    previewTemplate.forEach(item => {
      expectedCounts[item.stage] = (expectedCounts[item.stage] || 0) + 1
    })

    const realCounts = {}
    realMatches.forEach(item => {
      realCounts[item.stage] = (realCounts[item.stage] || 0) + 1
    })

    const merged = [...realMatches]
    const previewAddedCount = {}

    previewTemplate.forEach(preview => {
      const stage = preview.stage
      const expected = expectedCounts[stage] || 0
      const real = realCounts[stage] || 0
      const added = previewAddedCount[stage] || 0
      if (real + added < expected) {
        merged.push(preview)
        previewAddedCount[stage] = added + 1
      }
    })

    return merged.sort((a, b) => this.compareKnockoutDisplay(a, b, venueOrderMap))
  },

  compareKnockoutDisplay(a, b, venueOrderMap) {
    if (a.preview && !b.preview) return 1
    if (!a.preview && b.preview) return -1

    if (!a.preview && !b.preview) {
      const bySchedule = this.compareMatchesBySchedule(a, b, venueOrderMap)
      if (bySchedule !== 0) return bySchedule
    }

    return this.getKnockoutOrder(a) - this.getKnockoutOrder(b)
  },

  getKnockoutOrder(match) {
    if (!match) return 999

    if (match.stage === 'place5semi') {
      if (match.matchLabel && match.matchLabel.indexOf('1') >= 0) return 10
      if (match.matchLabel && match.matchLabel.indexOf('2') >= 0) return 11
      return 12
    }
    if (match.stage === 'semi') {
      if (match.matchLabel && match.matchLabel.indexOf('1') >= 0) return 20
      if (match.matchLabel && match.matchLabel.indexOf('2') >= 0) return 21
      return 22
    }
    if (match.stage === 'fifth') return 30
    if (match.stage === 'seventh') return 31
    if (match.stage === 'third') return 40
    if (match.stage === 'final') return 50
    if (match.stage === 'ninth') return 60
    return 999
  },

  // 进入比赛详情/录入
  goMatch(e) {
    const matchId = e.currentTarget.dataset.id
    if (!matchId || String(matchId).indexOf('preview-') === 0) {
      wx.showToast({ title: '这是预览对阵', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/packageMatch/pages/match/match?matchId=${matchId}`
    })
  },

  startMatchFromList(e) {
    if (!this.ensureAdmin()) return
    const matchId = e.currentTarget.dataset.id
    const current = this.data.currentTournament
    if (!current) return

    const result = tournament.startMatch(current.id, matchId)
    if (result) {
      wx.showToast({ title: '比赛已开始', icon: 'success' })
      this.loadData()
    }
  },

  openQuickScoreFromList(e) {
    if (!this.ensureAdmin()) return
    const matchId = e.currentTarget.dataset.id
    const current = this.data.currentTournament
    const match = current && (current.matches || []).find(item => item.id === matchId)
    if (!match || match.status === 'finished') return

    const homeScore = Number.isFinite(Number(match.homeScore)) ? Number(match.homeScore) : 0
    const awayScore = Number.isFinite(Number(match.awayScore)) ? Number(match.awayScore) : 0
    this.setData({
      showQuickScoreModal: true,
      quickMatchId: matchId,
      quickHomeTeamName: this.getDisplayTeamName(match, 'home', current),
      quickAwayTeamName: this.getDisplayTeamName(match, 'away', current),
      quickHomeScore: homeScore,
      quickAwayScore: awayScore,
      quickIsKnockout: match.stage !== 'group'
    })
    this.updateQuickPoints(homeScore, awayScore)
  },

  closeQuickScore() {
    this.setData({
      showQuickScoreModal: false,
      quickMatchId: ''
    })
  },

  stopQuickScoreTap() {},

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

  saveQuickScoreFromList() {
    const result = this.persistQuickScoreFromList()
    if (!result) return
    this.closeQuickScore()
    this.loadData()
    wx.showToast({ title: '比分已保存', icon: 'success' })
  },

  finishQuickScoreFromList() {
    const result = this.persistQuickScoreFromList()
    if (!result) return
    const matchId = this.data.quickMatchId
    const isKnockoutDraw = result.match.stage !== 'group' &&
      result.match.homeScore === result.match.awayScore
    this.closeQuickScore()
    this.loadData()

    if (isKnockoutDraw) {
      wx.showModal({
        title: '需要点球结算',
        content: '常规比分已保存。淘汰赛平局还需要录入点球结果。',
        confirmText: '去录点球',
        success: (res) => {
          if (!res.confirm) return
          wx.navigateTo({
            url: `/packageMatch/pages/match/match?matchId=${matchId}`
          })
        }
      })
      return
    }

    const finished = tournament.finishMatch(
      this.data.currentTournament.id,
      matchId
    )
    if (!finished) {
      wx.showToast({ title: '比赛结束失败', icon: 'none' })
      return
    }
    wx.showToast({ title: '比分已保存，比赛结束', icon: 'success' })
    this.loadData()
  },

  persistQuickScoreFromList() {
    const result = tournament.updateMatchScoreQuickly(
      this.data.currentTournament.id,
      this.data.quickMatchId,
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

  finishMatchFromList(e) {
    if (!this.ensureAdmin()) return
    const matchId = e.currentTarget.dataset.id
    const current = this.data.currentTournament
    if (!current) return

    const match = (current.matches || []).find(m => m.id === matchId)
    if (!match) return

    const isKnockout = match.stage !== 'group'
    const isDraw = match.homeScore === match.awayScore
    if (isKnockout && isDraw) {
      wx.showModal({
        title: '需要点球结算',
        content: '排位赛平局需要录入点球，请进入详情页操作。',
        success: (res) => {
          if (!res.confirm) return
          wx.navigateTo({
            url: `/packageMatch/pages/match/match?matchId=${matchId}`
          })
        }
      })
      return
    }

    wx.showModal({
      title: '确认结束',
      content: '确定结束这场比赛吗？',
      success: (res) => {
        if (!res.confirm) return
        const result = tournament.finishMatch(current.id, matchId)
        if (result) {
          wx.showToast({ title: '已结束', icon: 'success' })
          this.loadData()
        }
      }
    })
  },

  reopenMatchFromList(e) {
    if (!this.ensureAdmin()) return
    const matchId = e.currentTarget.dataset.id
    const current = this.data.currentTournament
    if (!current || !matchId) return

    wx.showModal({
      title: '重新编辑比赛',
      content: '已有比分和事件会保留。若后续比赛已经开始，其对阵不会被自动更改。',
      confirmText: '重新编辑',
      success: (res) => {
        if (!res.confirm) return
        const result = tournament.reopenMatch(current.id, matchId)
        if (!result) {
          wx.showToast({ title: '重新打开失败', icon: 'none' })
          return
        }
        this.loadData()
        wx.navigateTo({
          url: `/packageMatch/pages/match/match?matchId=${matchId}`
        })
      }
    })
  },

  editScheduleTap(e) {
    if (!this.ensureAdmin()) return
    const matchId = e.currentTarget.dataset.id
    this.openScheduleEditor(matchId)
  },

  getScheduleText(match, tournamentData) {
    const parts = []

    const hasStartAndEnd = match.startTimeText && match.endTimeText
    if (hasStartAndEnd) {
      parts.push(`${match.startTimeText}-${match.endTimeText}`)
    } else if (match.startTimeText) {
      parts.push(match.startTimeText)
    }

    let duration = null
    if (typeof match.startMinute === 'number' && typeof match.endMinute === 'number') {
      duration = Math.max(0, match.endMinute - match.startMinute)
    } else if (tournamentData && tournamentData.scheduleConfig) {
      duration = match.stage === 'group'
        ? tournamentData.scheduleConfig.groupMatchMinutes
        : tournamentData.scheduleConfig.knockoutMatchMinutes
    }

    if (typeof duration === 'number') {
      parts.push(`${duration}分钟`)
    }

    if (match.venueName) parts.push(match.venueName)
    return parts.join(' · ')
  },

  getDisplayTeamName(match, side, tournamentData) {
    const teamId = side === 'home' ? match.homeTeam : match.awayTeam
    if (teamId) {
      return tournament.getTeamName(tournamentData, teamId)
    }
    const refText = side === 'home' ? match.homeRefText : match.awayRefText
    return refText || '待定'
  },

  getPenaltyText(match) {
    if (typeof match.penaltyHomeScore !== 'number' || typeof match.penaltyAwayScore !== 'number') return ''
    return `点球 ${match.penaltyHomeScore}:${match.penaltyAwayScore}`
  },

  getEventPreview(match, tournamentData) {
    const events = (match.events || []).slice(-3)
    if (events.length === 0) return { items: [], more: 0 }

    const items = events.map(e => {
      const teamName = tournament.getTeamName(tournamentData, e.teamId)
      const typeMap = { goal: '⚽', yellow: '🟨', red: '🟥' }
      const icon = typeMap[e.type] || '•'
      const number = e.playerNumber ? `#${e.playerNumber}` : '#?'
      const minute = e.minute ? `${e.minute}'` : ''
      const isHome = e.teamId === match.homeTeam
      return {
        icon,
        sideText: isHome ? '主' : '客',
        sideClass: isHome ? 'home' : 'away',
        teamName,
        number,
        minute
      }
    })

    const more = (match.events || []).length - items.length
    return { items, more }
  },

  onLongPressMatch(e) {
    if (!this.ensureAdmin()) return
    const matchId = e.currentTarget.dataset.id
    this.openScheduleEditor(matchId)
  },

  openScheduleEditor(matchId) {
    if (!this.ensureAdmin()) return
    if (!matchId) return

    const isPreview = String(matchId).indexOf('preview-') === 0

    const match = isPreview
      ? (this.data.knockoutMatches || []).find(m => m.id === matchId)
      : (this.data.currentTournament.matches || []).find(m => m.id === matchId)
    if (!match) return

    const venues = (this.data.currentTournament.scheduleConfig && this.data.currentTournament.scheduleConfig.venues) || []
    const venueNames = venues.map(v => v.name)

    if (venueNames.length === 0) {
      wx.showToast({ title: '未配置场地', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: venueNames,
      success: (res) => {
        const selected = venues[res.tapIndex]
        const defaultDuration = this.getMatchDurationForEdit(match)
        wx.showModal({
          title: '设置开赛时间',
          editable: true,
          placeholderText: 'HH:mm，例如 10:30',
          content: match.startTimeText || '',
          success: (modalRes) => {
            if (!modalRes.confirm) return
            const text = (modalRes.content || '').trim()
            if (!/^(\d{1,2}):(\d{2})$/.test(text)) {
              wx.showToast({ title: '时间格式应为 HH:mm', icon: 'none' })
              return
            }

            wx.showModal({
              title: '设置比赛时长(分钟)',
              editable: true,
              placeholderText: '请输入分钟数，例如 12',
              content: String(defaultDuration),
              success: (durationRes) => {
                if (!durationRes.confirm) return
                const rawDuration = (durationRes.content || '').trim()
                const duration = parseInt(rawDuration, 10)
                if (!Number.isFinite(duration) || duration <= 0) {
                  wx.showToast({ title: '时长需为正整数', icon: 'none' })
                  return
                }

                if (isPreview) {
                  this.savePreviewScheduleEdit(matchId, {
                    venueId: selected.id,
                    venueName: selected.name,
                    startTimeText: text,
                    durationMinutes: duration
                  })
                } else {
                  tournament.updateMatchSchedule(this.data.currentTournament.id, matchId, {
                    venueId: selected.id,
                    venueName: selected.name,
                    startTimeText: text,
                    durationMinutes: duration
                  })
                }
                wx.showToast({ title: '已更新排程', icon: 'success' })
                this.loadData()
              }
            })
          }
        })
      }
    })
  },

  savePreviewScheduleEdit(previewId, payload) {
    if (!this.ensureAdmin()) return
    const current = this.data.currentTournament
    if (!current || !previewId) return

    const nextTournament = {
      ...current,
      previewScheduleEdits: {
        ...(current.previewScheduleEdits || {}),
        [previewId]: {
          venueId: payload.venueId,
          venueName: payload.venueName,
          startTimeText: payload.startTimeText,
          durationMinutes: payload.durationMinutes
        }
      }
    }

    tournament.saveTournament(nextTournament)
  },

  ensureAdmin() {
    if (this.data.isAdmin) return true
    wx.showToast({ title: '当前账号只有查看权限', icon: 'none' })
    return false
  },

  getMatchDurationForEdit(match) {
    if (typeof match.startMinute === 'number' && typeof match.endMinute === 'number') {
      const duration = match.endMinute - match.startMinute
      if (duration > 0) return duration
    }

    const cfg = this.data.currentTournament && this.data.currentTournament.scheduleConfig
    if (!cfg) return 12
    return match.stage === 'group' ? cfg.groupMatchMinutes : cfg.knockoutMatchMinutes
  }
})
