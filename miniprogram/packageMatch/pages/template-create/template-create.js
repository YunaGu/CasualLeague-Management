const tournament = require('../../../utils/tournament')

Page({
  data: {
    isEditMode: false,
    editingTemplateId: '',
    editingTemplateCreatedAt: null,

    step: 1, // 1: 基本配置, 2: 编排拖拽, 3: 保存

    // 步骤1：基本配置
    teamCount: 6,
    teamCountOptions: [4, 5, 6, 7, 8, 9, 10, 12],
    teamSlotOptions: [1, 2, 3, 4, 5, 6],
    teamCountIndex: 2,
    venueCount: 2,
    venueCountOptions: [1, 2, 3, 4],
    venueCountIndex: 1,
    startTime: '09:00',
    matchDuration: 20,
    breakMinutes: 3,

    // 步骤2：编排
    matchSlots: [],
    matchIdCounter: 0, // 用于生成唯一编号

    // 拖拽状态
    isDragging: false,
    dragIndex: -1,
    dropTargetIndex: -1,
    dragGhostTop: 0,
    dragGhostLeft: 0,

    // 添加比赛 - 阶段选择弹窗
    showAddModal: false,
    addStage: 'group', // 'group' or 'knockout'
    addRound: 1,
    addGroup: 0, // 当前选择的分组索引
    addHomeSlot: 0,
    addAwaySlot: 1,
    addHomeRefType: 'rank', // 'rank' | 'winner' | 'loser'
    addHomeRefRank: 1,
    addHomeRefMatchId: 1,
    addAwayRefType: 'rank', // 'rank' | 'winner' | 'loser'
    addAwayRefRank: 2,
    addAwayRefMatchId: 2,
    addMatchLabel: '',
    addVenueIndex: 0,
    addStartTime: '09:00',
    addDuration: 20,

    // 编辑弹窗
    showEditModal: false,
    editingIndex: -1,
    editStage: 'group',
    editRound: 1,
    editGroup: 0, // 当前编辑的分组索引
    editHomeSlot: 0,
    editAwaySlot: 1,
    editHomeRefType: 'rank',
    editHomeRefRank: 1,
    editHomeRefMatchId: 1,
    editAwayRefType: 'rank',
    editAwayRefRank: 2,
    editAwayRefMatchId: 2,
    editMatchLabel: '',
    editVenueIndex: 0,
    editStartTime: '09:00',
    editDuration: 20,

    // 排位赛引用类型选项
    refTypeOptions: ['排名引用', '胜者引用', '败者引用'],

    // 分组配置
    useGroups: false,
    groupCount: 2,
    groupOptions: ['A组', 'B组'], // 分组选项列表
    groupTeamOptions: [], // 当前分组内的队伍选项（用于picker显示）
    groupTeamSlots: [], // 当前分组内的全局slot索引列表

    // 步骤3：保存
    templateName: '',
    templateDesc: ''
  },

  onLoad(options) {
    // 初始化队伍槽位选项（队伍1..N）
    this.setData({
      teamSlotOptions: this.buildTeamSlotOptions(this.data.teamCount),
      groupOptions: this.buildGroupOptions(this.data.groupCount)
    })

    if (options && options.templateId) {
      this.loadTemplateForEdit(options.templateId)
    }
  },

  loadTemplateForEdit(templateId) {
    const template = tournament.getTemplate(templateId)
    if (!template) {
      wx.showToast({ title: '模板不存在', icon: 'none' })
      return
    }

    const teamCountOptions = this.data.teamCountOptions
    const venueCountOptions = this.data.venueCountOptions

    const teamCount = template.teamCount || 6
    const venueCount = (template.venues && template.venues.length) || template.venueCount || 2
    const teamCountIndex = Math.max(0, teamCountOptions.indexOf(teamCount))
    const venueCountIndex = Math.max(0, venueCountOptions.indexOf(venueCount))

    const scheduleConfig = template.scheduleConfig || {}
    const templateConfig = template.templateConfig || {}
    const matchSlots = (template.matchSlots || []).map((slot, idx) => ({
      ...slot,
      matchId: slot.matchId != null ? slot.matchId : (idx + 1),
      stage: slot.stage || 'group',
      round: slot.round || 1
    }))

    const maxMatchId = matchSlots.reduce((max, slot) => {
      const id = parseInt(slot.matchId, 10)
      return Number.isFinite(id) && id > max ? id : max
    }, 0)

    this.setData({
      isEditMode: true,
      editingTemplateId: template.id,
      editingTemplateCreatedAt: template.createdAt || null,
      teamCount,
      teamCountIndex,
      venueCount,
      venueCountIndex,
      teamSlotOptions: this.buildTeamSlotOptions(teamCount),
      startTime: scheduleConfig.startTime || '09:00',
      matchDuration: scheduleConfig.groupMatchMinutes || 20,
      breakMinutes: scheduleConfig.breakMinutes || 3,
      useGroups: !!templateConfig.useGroups,
      groupCount: templateConfig.groupCount || 2,
      groupOptions: this.buildGroupOptions(templateConfig.groupCount || 2),
      matchSlots,
      matchIdCounter: maxMatchId,
      templateName: template.name || '',
      templateDesc: template.description || ''
    })

    // 如果启用分组，为已有的小组赛slot补充分组标签
    if (templateConfig.useGroups) {
      const updatedSlots = matchSlots.map(slot => {
        if (slot.stage === 'group') {
          slot.homeLabel = this.getGroupTeamLabel(slot.homeSlot)
          slot.awayLabel = this.getGroupTeamLabel(slot.awaySlot)
        }
        return slot
      })
      this.setData({ matchSlots: updatedSlots })
    }
  },

  // ==================== 步骤1：基本配置 ====================

  onTeamCountChange(e) {
    const idx = parseInt(e.detail.value, 10)
    const teamCount = this.data.teamCountOptions[idx]
    const maxSlotIndex = Math.max(0, teamCount - 1)
    this.setData({
      teamCountIndex: idx,
      teamCount,
      teamSlotOptions: this.buildTeamSlotOptions(teamCount),
      addHomeSlot: Math.min(this.data.addHomeSlot, maxSlotIndex),
      addAwaySlot: Math.min(this.data.addAwaySlot, maxSlotIndex),
      editHomeSlot: Math.min(this.data.editHomeSlot, maxSlotIndex),
      editAwaySlot: Math.min(this.data.editAwaySlot, maxSlotIndex)
    })
  },

  onVenueCountChange(e) {
    const idx = parseInt(e.detail.value, 10)
    const venueCount = this.data.venueCountOptions[idx]
    this.setData({ venueCountIndex: idx, venueCount })
  },

  onStartTimeInput(e) {
    this.setData({ startTime: e.detail.value })
  },

  onDurationInput(e) {
    this.setData({ matchDuration: e.detail.value })
  },

  onBreakInput(e) {
    this.setData({ breakMinutes: e.detail.value })
  },

  onUseGroupsChange(e) {
    this.setData({ useGroups: e.detail.value === '0' })
  },

  onGroupCountInput(e) {
    const groupCount = parseInt(e.detail.value, 10) || 2
    this.setData({
      groupCount: e.detail.value,
      groupOptions: this.buildGroupOptions(groupCount)
    })
  },

  /**
   * 进入编排步骤 - 直接进入空列表，手动添加比赛
   */
  goToArrange() {
    const { startTime, matchDuration, isEditMode, matchSlots } = this.data

    if (!/^\d{1,2}:\d{2}$/.test(startTime)) {
      wx.showToast({ title: '开始时间格式应为 HH:mm', icon: 'none' })
      return
    }

    if (!(parseInt(matchDuration, 10) > 0)) {
      wx.showToast({ title: '比赛时长须大于0', icon: 'none' })
      return
    }

    if (isEditMode) {
      this.setData({ step: 2 })
      return
    }

    this.setData({ step: 2, matchSlots: [], matchIdCounter: 0 })
  },

  // ==================== 步骤2：编排拖拽 ====================

  /**
   * 获取队伍占位名
   */
  getTeamLabel(slotIndex) {
    return `队伍${slotIndex + 1}`
  },

  /**
   * 获取场地占位名
   */
  getVenueLabel(venueIndex) {
    return `场地${venueIndex + 1}`
  },

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
      dragGhostLeft: 20
    })

    this.getCardPositions()
  },

  getCardPositions() {
    const query = wx.createSelectorQuery().in(this)
    query.selectAll('.slot-card').boundingClientRect()
    query.exec(res => {
      if (res && res[0]) {
        this._cardRects = res[0]
      }
    })
  },

  onTouchMove(e) {
    if (!this.data.isDragging) return

    const clientY = e.touches[0].clientY
    this.setData({
      dragGhostTop: clientY - 40,
      dragGhostLeft: 20
    })

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

  onTouchEnd() {
    if (!this.data.isDragging) return

    const { dragIndex, dropTargetIndex, matchSlots } = this.data

    if (dropTargetIndex >= 0 && dropTargetIndex !== dragIndex) {
      // 交换两场比赛的位置（整体交换，包含时间和场地）
      const temp = { ...matchSlots[dragIndex] }
      const target = { ...matchSlots[dropTargetIndex] }

      // 交换时间槽和场地，保留各自的对阵
      const tempTime = { startMinute: temp.startMinute, endMinute: temp.endMinute, startTimeText: temp.startTimeText, endTimeText: temp.endTimeText, venueIndex: temp.venueIndex }

      matchSlots[dragIndex].startMinute = target.startMinute
      matchSlots[dragIndex].endMinute = target.endMinute
      matchSlots[dragIndex].startTimeText = target.startTimeText
      matchSlots[dragIndex].endTimeText = target.endTimeText
      matchSlots[dragIndex].venueIndex = target.venueIndex

      matchSlots[dropTargetIndex].startMinute = tempTime.startMinute
      matchSlots[dropTargetIndex].endMinute = tempTime.endMinute
      matchSlots[dropTargetIndex].startTimeText = tempTime.startTimeText
      matchSlots[dropTargetIndex].endTimeText = tempTime.endTimeText
      matchSlots[dropTargetIndex].venueIndex = tempTime.venueIndex

      this.setData({ matchSlots })
      wx.vibrateShort({ type: 'light' })
    }

    this.setData({
      isDragging: false,
      dragIndex: -1,
      dropTargetIndex: -1
    })
  },

  /**
   * 点击编辑某场比赛
   */
  editSlot(e) {
    if (this.data.isDragging) return

    const index = e.currentTarget.dataset.index
    const slot = this.data.matchSlots[index]
    if (!slot) return

    const editData = {
      showEditModal: true,
      editingIndex: index,
      editStage: slot.stage || 'group',
      editRound: slot.round || 1,
      editVenueIndex: slot.venueIndex,
      editStartTime: slot.startTimeText,
      editDuration: slot.durationMinutes || this.data.matchDuration
    }

    if (slot.stage === 'knockout') {
      const homeRef = slot.homeRef || { type: 'rank', rank: 1 }
      const awayRef = slot.awayRef || { type: 'rank', rank: 2 }
      editData.editMatchLabel = slot.matchLabel || `排位赛#${slot.matchId}`
      editData.editHomeRefType = homeRef.type
      editData.editHomeRefRank = homeRef.rank || 1
      editData.editHomeRefMatchId = homeRef.matchId || 1
      editData.editAwayRefType = awayRef.type
      editData.editAwayRefRank = awayRef.rank || 2
      editData.editAwayRefMatchId = awayRef.matchId || 2
    } else {
      editData.editHomeSlot = slot.homeSlot
      editData.editAwaySlot = slot.awaySlot

      // 如果启用分组，根据homeSlot推算所属分组
      if (this.data.useGroups) {
        const groupIdx = this.getGroupIndexBySlot(slot.homeSlot)
        const info = this.getGroupTeamInfo(groupIdx)
        editData.editGroup = groupIdx
        editData.groupTeamOptions = info.options
        editData.groupTeamSlots = info.slots
      }
    }

    this.setData(editData)
  },

  closeEditModal() {
    this.setData({ showEditModal: false, editingIndex: -1 })
  },

  onEditStageChange(e) {
    this.setData({ editStage: e.detail.value === '0' ? 'group' : 'knockout' })
  },

  onEditRoundInput(e) {
    this.setData({ editRound: e.detail.value })
  },

  onEditGroupChange(e) {
    const groupIndex = parseInt(e.detail.value, 10)
    const info = this.getGroupTeamInfo(groupIndex)
    this.setData({
      editGroup: groupIndex,
      groupTeamOptions: info.options,
      groupTeamSlots: info.slots,
      editHomeSlot: info.slots[0] != null ? info.slots[0] : 0,
      editAwaySlot: info.slots[1] != null ? info.slots[1] : 1
    })
  },

  onEditHomeChange(e) {
    const localIdx = parseInt(e.detail.value, 10)
    if (this.data.useGroups) {
      this.setData({ editHomeSlot: this.data.groupTeamSlots[localIdx] })
    } else {
      this.setData({ editHomeSlot: localIdx })
    }
  },

  onEditAwayChange(e) {
    const localIdx = parseInt(e.detail.value, 10)
    if (this.data.useGroups) {
      this.setData({ editAwaySlot: this.data.groupTeamSlots[localIdx] })
    } else {
      this.setData({ editAwaySlot: localIdx })
    }
  },

  onEditHomeRefTypeChange(e) {
    const types = ['rank', 'winner', 'loser']
    this.setData({ editHomeRefType: types[parseInt(e.detail.value, 10)] })
  },

  onEditHomeRefRankInput(e) {
    this.setData({ editHomeRefRank: e.detail.value })
  },

  onEditHomeRefMatchIdInput(e) {
    this.setData({ editHomeRefMatchId: e.detail.value })
  },

  onEditAwayRefTypeChange(e) {
    const types = ['rank', 'winner', 'loser']
    this.setData({ editAwayRefType: types[parseInt(e.detail.value, 10)] })
  },

  onEditAwayRefRankInput(e) {
    this.setData({ editAwayRefRank: e.detail.value })
  },

  onEditAwayRefMatchIdInput(e) {
    this.setData({ editAwayRefMatchId: e.detail.value })
  },

  onEditMatchLabelInput(e) {
    this.setData({ editMatchLabel: e.detail.value })
  },

  onEditVenueChange(e) {
    this.setData({ editVenueIndex: parseInt(e.detail.value, 10) })
  },

  onEditTimeInput(e) {
    this.setData({ editStartTime: e.detail.value })
  },

  onEditDurationInput(e) {
    this.setData({ editDuration: e.detail.value })
  },

  saveSlotEdit() {
    const { editingIndex, editStage, editRound, editHomeSlot, editAwaySlot, editHomeRefType, editHomeRefRank, editHomeRefMatchId, editAwayRefType, editAwayRefRank, editAwayRefMatchId, editMatchLabel, editVenueIndex, editStartTime, editDuration, matchSlots } = this.data

    const parsedEditRound = parseInt(editRound, 10) || 1
    const parsedEditDuration = parseInt(editDuration, 10) || 20
    const parsedEditHomeRefRank = parseInt(editHomeRefRank, 10) || 1
    const parsedEditHomeRefMatchId = parseInt(editHomeRefMatchId, 10) || 1
    const parsedEditAwayRefRank = parseInt(editAwayRefRank, 10) || 1
    const parsedEditAwayRefMatchId = parseInt(editAwayRefMatchId, 10) || 1

    if (editStage === 'group' && editHomeSlot === editAwaySlot) {
      wx.showToast({ title: '主客队不能相同', icon: 'none' })
      return
    }

    if (!/^\d{1,2}:\d{2}$/.test(editStartTime)) {
      wx.showToast({ title: '时间格式应为 HH:mm', icon: 'none' })
      return
    }

    const startMinute = this.parseTime(editStartTime)
    const endMinute = startMinute + parsedEditDuration

    const updatedSlot = {
      ...matchSlots[editingIndex],
      stage: editStage,
      round: parsedEditRound,
      venueIndex: editVenueIndex,
      startMinute: startMinute,
      endMinute: endMinute,
      startTimeText: this.formatMinutes(startMinute),
      endTimeText: this.formatMinutes(endMinute),
      durationMinutes: parsedEditDuration
    }

    if (editStage === 'group') {
      updatedSlot.homeSlot = editHomeSlot
      updatedSlot.awaySlot = editAwaySlot
      updatedSlot.homeLabel = this.getGroupTeamLabel(editHomeSlot)
      updatedSlot.awayLabel = this.getGroupTeamLabel(editAwaySlot)
      delete updatedSlot.homeRef
      delete updatedSlot.awayRef
      delete updatedSlot.matchLabel
    } else {
      updatedSlot.homeRef = this._buildRef(editHomeRefType, parsedEditHomeRefRank, parsedEditHomeRefMatchId)
      updatedSlot.awayRef = this._buildRef(editAwayRefType, parsedEditAwayRefRank, parsedEditAwayRefMatchId)
      updatedSlot.matchLabel = (editMatchLabel || '').trim() || `排位赛#${updatedSlot.matchId}`
      delete updatedSlot.homeSlot
      delete updatedSlot.awaySlot
    }

    matchSlots[editingIndex] = updatedSlot
    this.setData({ matchSlots })
    this.closeEditModal()
  },

  /**
   * 删除某场比赛
   */
  deleteSlot(e) {
    const index = e.currentTarget.dataset.index
    const matchSlots = this.data.matchSlots
    matchSlots.splice(index, 1)
    this.setData({ matchSlots })
  },

  /**
   * 添加一场比赛 - 打开添加弹窗
   */
  addSlot() {
    const { matchSlots, matchDuration, startTime, useGroups } = this.data
    const lastSlot = matchSlots[matchSlots.length - 1]
    const nextStartTime = lastSlot
      ? this.formatMinutes(lastSlot.endMinute + this.data.breakMinutes)
      : startTime

    const addData = {
      showAddModal: true,
      addStage: 'group',
      addRound: 1,
      addGroup: 0,
      addHomeSlot: 0,
      addAwaySlot: 1,
      addHomeRefType: 'rank',
      addHomeRefRank: 1,
      addHomeRefMatchId: 1,
      addAwayRefType: 'rank',
      addAwayRefRank: 2,
      addAwayRefMatchId: 2,
      addMatchLabel: `排位赛#${this.data.matchIdCounter + 1}`,
      addVenueIndex: 0,
      addStartTime: nextStartTime,
      addDuration: matchDuration
    }

    // 如果启用分组，初始化分组内的队伍选项
    if (useGroups) {
      const info = this.getGroupTeamInfo(0)
      addData.groupTeamOptions = info.options
      addData.groupTeamSlots = info.slots
      addData.addHomeSlot = info.slots[0] != null ? info.slots[0] : 0
      addData.addAwaySlot = info.slots[1] != null ? info.slots[1] : 1
    }

    this.setData(addData)
  },

  closeAddModal() {
    this.setData({ showAddModal: false })
  },

  onAddStageChange(e) {
    this.setData({ addStage: e.detail.value === '0' ? 'group' : 'knockout' })
  },

  onAddRoundInput(e) {
    this.setData({ addRound: e.detail.value })
  },

  onAddGroupChange(e) {
    const groupIndex = parseInt(e.detail.value, 10)
    const info = this.getGroupTeamInfo(groupIndex)
    this.setData({
      addGroup: groupIndex,
      groupTeamOptions: info.options,
      groupTeamSlots: info.slots,
      addHomeSlot: info.slots[0] != null ? info.slots[0] : 0,
      addAwaySlot: info.slots[1] != null ? info.slots[1] : 1
    })
  },

  onAddHomeSlotChange(e) {
    const localIdx = parseInt(e.detail.value, 10)
    if (this.data.useGroups) {
      this.setData({ addHomeSlot: this.data.groupTeamSlots[localIdx] })
    } else {
      this.setData({ addHomeSlot: localIdx })
    }
  },

  onAddAwaySlotChange(e) {
    const localIdx = parseInt(e.detail.value, 10)
    if (this.data.useGroups) {
      this.setData({ addAwaySlot: this.data.groupTeamSlots[localIdx] })
    } else {
      this.setData({ addAwaySlot: localIdx })
    }
  },

  onAddHomeRefTypeChange(e) {
    const types = ['rank', 'winner', 'loser']
    this.setData({ addHomeRefType: types[parseInt(e.detail.value, 10)] })
  },

  onAddHomeRefRankInput(e) {
    this.setData({ addHomeRefRank: e.detail.value })
  },

  onAddHomeRefMatchIdInput(e) {
    this.setData({ addHomeRefMatchId: e.detail.value })
  },

  onAddAwayRefTypeChange(e) {
    const types = ['rank', 'winner', 'loser']
    this.setData({ addAwayRefType: types[parseInt(e.detail.value, 10)] })
  },

  onAddAwayRefRankInput(e) {
    this.setData({ addAwayRefRank: e.detail.value })
  },

  onAddAwayRefMatchIdInput(e) {
    this.setData({ addAwayRefMatchId: e.detail.value })
  },

  onAddMatchLabelInput(e) {
    this.setData({ addMatchLabel: e.detail.value })
  },

  onAddVenueChange(e) {
    this.setData({ addVenueIndex: parseInt(e.detail.value, 10) })
  },

  onAddTimeInput(e) {
    this.setData({ addStartTime: e.detail.value })
  },

  onAddDurationInput(e) {
    this.setData({ addDuration: e.detail.value })
  },

  confirmAddSlot() {
    const { addStage, addRound, addHomeSlot, addAwaySlot, addHomeRefType, addHomeRefRank, addHomeRefMatchId, addAwayRefType, addAwayRefRank, addAwayRefMatchId, addMatchLabel, addVenueIndex, addStartTime, addDuration, matchSlots, matchIdCounter } = this.data

    const parsedAddRound = parseInt(addRound, 10) || 1
    const parsedAddDuration = parseInt(addDuration, 10) || 20
    const parsedAddHomeRefRank = parseInt(addHomeRefRank, 10) || 1
    const parsedAddHomeRefMatchId = parseInt(addHomeRefMatchId, 10) || 1
    const parsedAddAwayRefRank = parseInt(addAwayRefRank, 10) || 1
    const parsedAddAwayRefMatchId = parseInt(addAwayRefMatchId, 10) || 1

    if (addStage === 'group' && addHomeSlot === addAwaySlot) {
      wx.showToast({ title: '主客队不能相同', icon: 'none' })
      return
    }

    if (!/^\d{1,2}:\d{2}$/.test(addStartTime)) {
      wx.showToast({ title: '时间格式应为 HH:mm', icon: 'none' })
      return
    }

    const startMinute = this.parseTime(addStartTime)
    const endMinute = startMinute + parsedAddDuration
    const newMatchId = matchIdCounter + 1

    const newSlot = {
      matchId: newMatchId,
      stage: addStage,
      venueIndex: addVenueIndex,
      startMinute: startMinute,
      endMinute: endMinute,
      startTimeText: this.formatMinutes(startMinute),
      endTimeText: this.formatMinutes(endMinute),
      durationMinutes: parsedAddDuration
    }

    if (addStage === 'group') {
      newSlot.round = parsedAddRound
      newSlot.homeSlot = addHomeSlot
      newSlot.awaySlot = addAwaySlot
      newSlot.homeLabel = this.getGroupTeamLabel(addHomeSlot)
      newSlot.awayLabel = this.getGroupTeamLabel(addAwaySlot)
    } else {
      newSlot.round = parsedAddRound
      newSlot.homeRef = this._buildRef(addHomeRefType, parsedAddHomeRefRank, parsedAddHomeRefMatchId)
      newSlot.awayRef = this._buildRef(addAwayRefType, parsedAddAwayRefRank, parsedAddAwayRefMatchId)
      newSlot.matchLabel = (addMatchLabel || '').trim() || `排位赛#${newMatchId}`
    }

    matchSlots.push(newSlot)
    this.setData({ matchSlots, matchIdCounter: newMatchId })
    this.closeAddModal()
  },

  /**
   * 构建队伍引用对象
   */
  _buildRef(type, rank, matchId) {
    if (type === 'rank') {
      return { type: 'rank', rank: rank }
    } else if (type === 'winner') {
      return { type: 'winner', matchId: matchId }
    } else {
      return { type: 'loser', matchId: matchId }
    }
  },

  /**
   * 获取引用类型在选项数组中的索引
   */
  _getRefTypeIndex(type) {
    const types = ['rank', 'winner', 'loser']
    return types.indexOf(type) >= 0 ? types.indexOf(type) : 0
  },

  // ==================== 步骤3：保存 ====================

  goToSave() {
    if (this.data.matchSlots.length === 0) {
      wx.showToast({ title: '请至少添加一场比赛', icon: 'none' })
      return
    }
    this.setData({ step: 3 })
  },

  onTemplateNameInput(e) {
    this.setData({ templateName: e.detail.value })
  },

  onTemplateDescInput(e) {
    this.setData({ templateDesc: e.detail.value })
  },

  /**
   * 保存模板
   */
  saveTemplate() {
    const { isEditMode, editingTemplateId, editingTemplateCreatedAt, templateName, templateDesc, teamCount, venueCount, startTime, matchDuration, breakMinutes, matchSlots, useGroups, groupCount } = this.data

    if (!templateName.trim()) {
      wx.showToast({ title: '请输入模板名称', icon: 'none' })
      return
    }

    const parsedMatchDuration = parseInt(matchDuration, 10) || 20
    const parsedBreakMinutes = parseInt(breakMinutes, 10) || 3
    const parsedGroupCount = parseInt(groupCount, 10) || 2
    const hasKnockout = matchSlots.some(s => s.stage === 'knockout')

    tournament.createTemplateDirectly({
      id: isEditMode ? editingTemplateId : undefined,
      createdAt: isEditMode ? editingTemplateCreatedAt : undefined,
      name: templateName.trim(),
      description: templateDesc.trim(),
      teamCount,
      venueCount,
      scheduleConfig: {
        startTime,
        breakMinutes: parsedBreakMinutes,
        groupMatchMinutes: parsedMatchDuration,
        knockoutMatchMinutes: parsedMatchDuration
      },
      templateConfig: {
        useGroups: useGroups,
        groupCount: useGroups ? parsedGroupCount : 1,
        legs: 1,
        enableKnockout: hasKnockout
      },
      matchSlots
    })

    wx.showToast({ title: isEditMode ? '模板已更新' : '模板已保存', icon: 'success' })
    setTimeout(() => {
      wx.navigateBack()
    }, 1500)
  },

  // ==================== 工具函数 ====================

  parseTime(timeStr) {
    const parts = (timeStr || '09:00').split(':').map(Number)
    return (parts[0] || 0) * 60 + (parts[1] || 0)
  },

  formatMinutes(total) {
    const h = Math.floor(total / 60)
    const m = total % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  },

  buildTeamSlotOptions(teamCount) {
    const options = []
    for (let i = 1; i <= teamCount; i++) {
      options.push(i)
    }
    return options
  },

  /**
   * 构建分组选项列表（A组、B组...）
   */
  buildGroupOptions(groupCount) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const options = []
    for (let i = 0; i < groupCount; i++) {
      options.push((alphabet[i] || `G${i + 1}`) + '组')
    }
    return options
  },

  /**
   * 获取指定分组内的队伍选项（用于picker显示）和全局slot索引列表
   * 分组逻辑：teamCount个队伍平均分配到groupCount个组
   * Group 0: slot 0 ~ teamsPerGroup-1
   * Group 1: slot teamsPerGroup ~ 2*teamsPerGroup-1
   * ...
   */
  getGroupTeamInfo(groupIndex) {
    const { teamCount, groupCount } = this.data
    const teamsPerGroup = Math.floor(teamCount / groupCount)
    const startSlot = groupIndex * teamsPerGroup
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const groupLetter = alphabet[groupIndex] || `G${groupIndex + 1}`

    const options = [] // picker显示文本
    const slots = [] // 对应的全局slot索引
    for (let i = 0; i < teamsPerGroup; i++) {
      options.push(`${groupLetter}${i + 1}`)
      slots.push(startSlot + i)
    }
    return { options, slots }
  },

  /**
   * 根据全局slot索引获取分组标签（如 "A1", "B2"）
   */
  getGroupTeamLabel(slotIndex) {
    const { teamCount, groupCount, useGroups } = this.data
    if (!useGroups || groupCount < 2) return `队伍${slotIndex + 1}`
    const teamsPerGroup = Math.floor(teamCount / groupCount)
    const groupIdx = Math.floor(slotIndex / teamsPerGroup)
    const localIdx = slotIndex % teamsPerGroup
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const groupLetter = alphabet[groupIdx] || `G${groupIdx + 1}`
    return `${groupLetter}${localIdx + 1}`
  },

  /**
   * 根据全局slot索引推算所属分组索引
   */
  getGroupIndexBySlot(slotIndex) {
    const { teamCount, groupCount } = this.data
    const teamsPerGroup = Math.floor(teamCount / groupCount)
    return Math.floor(slotIndex / teamsPerGroup)
  },

  goBackStep() {
    const step = this.data.step
    if (step > 1) {
      this.setData({ step: step - 1 })
    } else {
      wx.navigateBack()
    }
  }
})
