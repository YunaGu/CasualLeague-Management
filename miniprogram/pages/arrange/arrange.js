const tournament = require('../../utils/tournament')

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    teamCount: 0,
    teams: [],
    venues: [],
    scheduleConfig: null,
    templateConfig: null,
    
    // 比赛编排相关
    matches: [],
    timeSlots: [],
    
    // UI 状态
    editingMatchId: null,
    selectedVenueId: null,
    selectedTimeSlot: null,
    selectedTeam1Id: null,
    selectedTeam2Id: null,
    showMatchEditModal: false,
    showTeamPicker: false,
    teamPickerMode: '',
    
    // 拖拽状态
    isDragging: false,
    dragIndex: -1,
    dropTargetIndex: -1,
    dragGhostTop: 0,
    dragGhostLeft: 0,
    touchStartY: 0,
    touchStartX: 0,
    cardHeight: 0,
    listTop: 0,
    
    // 模板保存
    showSaveTemplateModal: false,
    templateName: '',
    templateDesc: ''
  },

  onLoad(options) {
    const tournamentId = options.tournamentId || tournament.getCurrentTournament()?.id
    if (!tournamentId) {
      wx.showToast({ title: '赛事不存在', icon: 'error' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    const tourn = tournament.getTournaments().find(t => t.id === tournamentId)
    if (!tourn) {
      wx.showToast({ title: '赛事不存在', icon: 'error' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.initSchedule(tourn)
  },

  initSchedule(tourn) {
    const { venues, scheduleConfig, templateConfig, teams, matches } = tourn
    const timeSlots = this.generateTimeSlots(scheduleConfig)
    
    this.setData({
      tournamentId: tourn.id,
      tournamentName: tourn.name,
      teamCount: tourn.teamCount,
      teams,
      venues: scheduleConfig.venues,
      scheduleConfig,
      templateConfig,
      matches: JSON.parse(JSON.stringify(matches)),
      timeSlots
    })
  },

  /**
   * 生成所有可用的时间槽
   */
  generateTimeSlots(scheduleConfig) {
    const slots = []
    const duration = scheduleConfig.groupMatchMinutes
    const breakMinutes = scheduleConfig.breakMinutes
    const startMinute = this.parseTime(scheduleConfig.startTime)
    
    let current = startMinute
    for (let i = 0; i < 15; i++) {
      slots.push({
        slot: `${this.formatMinutes(current)}-${this.formatMinutes(current + duration)}`,
        startMinute: current,
        duration: duration
      })
      current += duration + breakMinutes
    }
    
    return slots
  },

  parseTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
  },

  formatMinutes(total) {
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  },

  /**
   * 根据团队ID获取团队名称
   */
  getTeamName(teamId) {
    const team = this.data.teams.find(t => t.id === teamId)
    return team ? team.name : '--'
  },

  // ==================== 拖拽排序 ====================

  /**
   * 长按开始拖拽
   */
  onDragStart(e) {
    const index = e.currentTarget.dataset.index
    if (index == null) return

    wx.vibrateShort({ type: 'medium' })
    
    this.setData({
      isDragging: true,
      dragIndex: index,
      dropTargetIndex: -1,
      dragGhostTop: e.touches[0].clientY - 40,
      dragGhostLeft: 20,
      touchStartY: e.touches[0].clientY,
      touchStartX: e.touches[0].clientX
    })

    // 获取列表元素位置信息用于计算放置位置
    this.getMatchCardPositions()
  },

  /**
   * 获取所有卡片的位置信息
   */
  getMatchCardPositions() {
    const query = wx.createSelectorQuery().in(this)
    query.selectAll('.match-card').boundingClientRect()
    query.exec(res => {
      if (res && res[0]) {
        this._cardRects = res[0]
      }
    })
  },

  /**
   * 记录触摸起始点
   */
  onTouchStart(e) {
    // 仅在非拖拽时记录（用于区分 tap 和 drag）
    if (!this.data.isDragging) {
      this._touchStartTime = Date.now()
    }
  },

  /**
   * 触摸移动 - 拖拽跟随
   */
  onTouchMove(e) {
    if (!this.data.isDragging) return

    const clientY = e.touches[0].clientY
    const clientX = e.touches[0].clientX

    // 更新浮层位置
    this.setData({
      dragGhostTop: clientY - 40,
      dragGhostLeft: clientX - 150
    })

    // 计算当前手指在哪个卡片上方
    if (this._cardRects && this._cardRects.length > 0) {
      let targetIndex = -1
      for (let i = 0; i < this._cardRects.length; i++) {
        const rect = this._cardRects[i]
        if (clientY >= rect.top && clientY <= rect.bottom) {
          targetIndex = i
          break
        }
      }
      if (targetIndex !== this.data.dropTargetIndex) {
        this.setData({ dropTargetIndex: targetIndex })
      }
    }
  },

  /**
   * 触摸结束 - 执行交换
   */
  onTouchEnd(e) {
    if (!this.data.isDragging) return

    const { dragIndex, dropTargetIndex } = this.data

    if (dropTargetIndex >= 0 && dropTargetIndex !== dragIndex) {
      this.swapMatches(dragIndex, dropTargetIndex)
    }

    this.setData({
      isDragging: false,
      dragIndex: -1,
      dropTargetIndex: -1
    })
  },

  /**
   * 交换两场比赛的时间槽和场地
   */
  swapMatches(fromIndex, toIndex) {
    const matches = this.data.matches

    if (fromIndex < 0 || fromIndex >= matches.length) return
    if (toIndex < 0 || toIndex >= matches.length) return

    const fromMatch = matches[fromIndex]
    const toMatch = matches[toIndex]

    // 交换时间和场地信息
    const tempVenueId = fromMatch.venueId
    const tempVenueName = fromMatch.venueName
    const tempStartMinute = fromMatch.startMinute
    const tempEndMinute = fromMatch.endMinute
    const tempStartTimeText = fromMatch.startTimeText
    const tempEndTimeText = fromMatch.endTimeText

    fromMatch.venueId = toMatch.venueId
    fromMatch.venueName = toMatch.venueName
    fromMatch.startMinute = toMatch.startMinute
    fromMatch.endMinute = toMatch.endMinute
    fromMatch.startTimeText = toMatch.startTimeText
    fromMatch.endTimeText = toMatch.endTimeText

    toMatch.venueId = tempVenueId
    toMatch.venueName = tempVenueName
    toMatch.startMinute = tempStartMinute
    toMatch.endMinute = tempEndMinute
    toMatch.startTimeText = tempStartTimeText
    toMatch.endTimeText = tempEndTimeText

    // 同时交换数组位置以直观反映顺序变化
    matches[fromIndex] = toMatch
    matches[toIndex] = fromMatch

    this.setData({ matches })
    wx.vibrateShort({ type: 'light' })
  },

  // ==================== 编辑比赛 ====================

  /**
   * 点击编辑某场比赛
   */
  editMatch(e) {
    // 如果正在拖拽，不触发编辑
    if (this.data.isDragging) return

    const matchId = e.currentTarget.dataset.matchId
    const match = this.data.matches.find(m => m.id === matchId)
    if (!match) return

    this.setData({
      editingMatchId: matchId,
      selectedTimeSlot: match.startMinute || null,
      selectedVenueId: match.venueId || null,
      selectedTeam1Id: match.homeTeam || null,
      selectedTeam2Id: match.awayTeam || null,
      showMatchEditModal: true
    })
  },

  /**
   * 关闭编辑弹窗
   */
  closeMatchEditModal() {
    this.setData({
      showMatchEditModal: false,
      editingMatchId: null,
      selectedTimeSlot: null,
      selectedVenueId: null,
      selectedTeam1Id: null,
      selectedTeam2Id: null
    })
  },

  /**
   * 选择时间槽
   */
  selectTimeSlot(e) {
    const idx = parseInt(e.currentTarget.dataset.index, 10)
    const slot = this.data.timeSlots[idx]
    this.setData({ selectedTimeSlot: slot.startMinute })
  },

  /**
   * 选择场地
   */
  selectVenue(e) {
    const venueId = e.currentTarget.dataset.venueId
    this.setData({ selectedVenueId: venueId })
  },

  /**
   * 打开对手选择（Team 1）
   */
  showTeam1Picker() {
    this.setData({
      teamPickerMode: 'team1',
      showTeamPicker: true
    })
  },

  /**
   * 打开对手选择（Team 2）
   */
  showTeam2Picker() {
    this.setData({
      teamPickerMode: 'team2',
      showTeamPicker: true
    })
  },

  /**
   * 选择对手
   */
  selectTeam(e) {
    const teamId = e.currentTarget.dataset.teamId
    const { teamPickerMode } = this.data
    
    if (teamPickerMode === 'team1') {
      this.setData({ selectedTeam1Id: teamId, showTeamPicker: false })
    } else {
      this.setData({ selectedTeam2Id: teamId, showTeamPicker: false })
    }
  },

  /**
   * 关闭对手选择器
   */
  closeTeamPicker() {
    this.setData({ showTeamPicker: false })
  },

  /**
   * 保存对某场比赛的编辑
   */
  saveMatchEdit() {
    const { editingMatchId, selectedTimeSlot, selectedVenueId, selectedTeam1Id, selectedTeam2Id } = this.data
    const matches = this.data.matches
    const matchIdx = matches.findIndex(m => m.id === editingMatchId)
    
    if (matchIdx < 0) return

    const match = matches[matchIdx]
    const duration = this.data.scheduleConfig.groupMatchMinutes

    // 验证必填项
    if (!selectedTimeSlot || !selectedVenueId) {
      wx.showToast({ title: '请选择时间和场地', icon: 'none' })
      return
    }

    // 更新对手
    if (selectedTeam1Id) {
      match.team1Id = selectedTeam1Id
      match.homeTeam = selectedTeam1Id
    }
    if (selectedTeam2Id) {
      match.team2Id = selectedTeam2Id
      match.awayTeam = selectedTeam2Id
    }

    // 更新时间和场地
    match.startMinute = selectedTimeSlot
    match.endMinute = selectedTimeSlot + duration
    match.startTimeText = this.formatMinutes(selectedTimeSlot)
    match.endTimeText = this.formatMinutes(selectedTimeSlot + duration)
    match.venueId = selectedVenueId
    match.venueName = this.data.venues.find(v => v.id === selectedVenueId)?.name
    match.lockedSchedule = false // 标记此比赛已手动编排

    this.setData({ matches })
    this.closeMatchEditModal()
  },

  /**
   * 显示保存模板弹窗
   */
  showSaveTemplateModal() {
    this.setData({
      showSaveTemplateModal: true,
      templateName: `${this.data.tournamentName} (模板)`,
      templateDesc: ''
    })
  },

  /**
   * 关闭保存模板弹窗
   */
  closeSaveTemplateModal() {
    this.setData({
      showSaveTemplateModal: false,
      templateName: '',
      templateDesc: ''
    })
  },

  /**
   * 输入模板名称
   */
  onTemplateNameInput(e) {
    this.setData({ templateName: e.detail.value })
  },

  /**
   * 输入模板描述
   */
  onTemplateDescInput(e) {
    this.setData({ templateDesc: e.detail.value })
  },

  /**
   * 保存为新模板
   */
  saveAsTemplate() {
    const { templateName } = this.data
    if (!templateName.trim()) {
      wx.showToast({ title: '请输入模板名称', icon: 'none' })
      return
    }

    // 先更新赛事数据
    this.updateTournament()

    const tourn = tournament.getCurrentTournament()
    if (!tourn) {
      wx.showToast({ title: '赛事不存在', icon: 'error' })
      return
    }

    tournament.createTemplateFromTournament(
      tourn,
      templateName.trim(),
      this.data.templateDesc.trim()
    )

    wx.showToast({ title: '模板已保存', icon: 'success' })
    setTimeout(() => {
      this.closeSaveTemplateModal()
    }, 1500)
  },

  /**
   * 更新赛事数据
   */
  updateTournament() {
    const { matches, tournamentId } = this.data
    const tourn = tournament.getTournaments().find(t => t.id === tournamentId)
    
    if (tourn) {
      tourn.matches = matches
      tournament.saveTournament(tourn)
    }
  },

  /**
   * 保存并返回
   */
  saveAndReturn() {
    this.updateTournament()
    wx.showToast({ title: '编排已保存', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 1500)
  },

  /**
   * 取消返回
   */
  goBack() {
    wx.navigateBack()
  }
})
