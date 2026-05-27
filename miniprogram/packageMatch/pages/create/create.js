const tournament = require('../../../utils/tournament')

Page({
  data: {
    step: 1, // 1: 填写信息, 2: 分组
    name: '',
    teamCount: 6,
    teamCountOptions: [6, 8, 10],
    templateOptions: ['分组排位赛', '单循环联赛', '自定义模版'],
    templateType: 'group',
    templateIndex: 0,
    stageDurationLabel: '小组赛每场(分钟)',
    needsGrouping: true,
    customUseGroups: true,
    customLegsOptions: [1, 2],
    customLegsIndex: 1,
    customLegs: 2,
    customEnableKnockout: true,
    venueText: '1号场\n2号场',
    startTime: '09:00',
    groupMatchMinutes: 12,
    knockoutMatchMinutes: 20,
    breakMinutes: 3,
    teams: [],
    currentTeamIndex: -1,
    showPlayerModal: false,
    newPlayerName: '',
    newPlayerNumber: '',
    // 分组相关
    groupA: [],      // 存储球队索引
    groupB: [],
    unassigned: [],   // 未分配的球队索引
    // 模板相关
    fromTemplate: false,
    templateId: null,
    loadedTemplate: null,
    hasMatchSlots: false,
    venueMapping: []  // 场地名称映射数组
  },

   onLoad(options) {
     // 检查是否从模板创建
     const templateId = options?.templateId
     if (templateId) {
       this.loadTemplateAndInit(templateId)
     } else {
       this.initTeams(6)
       this.syncTemplateState()
     }
   },

   /**
     * 从模板加载配置
     */
   loadTemplateAndInit(templateId) {
     const template = tournament.getTemplate(templateId)
     if (!template) {
       wx.showToast({ title: '模板不存在', icon: 'error' })
       setTimeout(() => wx.navigateBack(), 1500)
       return
     }

     // 解析场地名称
     const venueText = template.venues.map(v => v.name).join('\n')
     const venueCount = template.venueCount || template.venues.length || 2

     // 生成场地映射数组（空字符串供用户填写）
     const venueMapping = []
     for (let i = 0; i < venueCount; i++) {
       venueMapping.push('')
     }

     // 如果模板记录了球队数量，使用模板的球队数量
     const teamCount = template.teamCount || 6
     const hasMatchSlots = template.matchSlots && template.matchSlots.length > 0

     this.setData({
       fromTemplate: true,
       templateId: templateId,
       loadedTemplate: template,
       hasMatchSlots: hasMatchSlots,
       venueMapping: venueMapping,
       // 从模板中加载配置
       venueText,
       startTime: template.scheduleConfig.startTime,
       groupMatchMinutes: template.scheduleConfig.groupMatchMinutes,
       knockoutMatchMinutes: template.scheduleConfig.knockoutMatchMinutes,
       breakMinutes: template.scheduleConfig.breakMinutes,
       teamCount: teamCount,
       // 设置模板类型（简化处理：直接用加载的模板配置）
       templateType: 'loaded'
     }, () => {
       this.initTeams(teamCount)
      this.syncTemplateState()
     })
  },

  syncTemplateState() {
    const templateConfig = this.getTemplateConfig()
    this.setData({
      needsGrouping: templateConfig.useGroups,
      stageDurationLabel: templateConfig.useGroups ? '小组赛每场(分钟)' : '联赛每场(分钟)'
    })
  },

  getTemplateConfig() {
    const {
      templateType,
      customUseGroups,
      customLegs,
      customEnableKnockout
    } = this.data
   if (templateType === 'loaded') {
     return this.data.loadedTemplate.templateConfig
   }


    if (templateType === 'league') {
      return {
        id: 'league-round-robin',
        name: '单循环联赛',
        useGroups: false,
        groupCount: 1,
        legs: 1,
        enableKnockout: false
      }
    }

    if (templateType === 'custom') {
      return {
        id: 'custom',
        name: '自定义模版',
        useGroups: customUseGroups,
        groupCount: customUseGroups ? 2 : 1,
        legs: customLegs,
        enableKnockout: customUseGroups && customEnableKnockout
      }
    }

    return {
      id: 'group-knockout',
      name: '分组排位赛',
      useGroups: true,
      groupCount: 2,
      legs: 2,
      enableKnockout: true
    }
  },

  // 初始化球队输入
  initTeams(count) {
    const teams = []
    for (let i = 0; i < count; i++) {
      teams.push({ name: '', players: [] })
    }
    this.setData({ teams, teamCount: count })
  },

  // 赛事名称输入
  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onVenueTextInput(e) {
    this.setData({ venueText: e.detail.value })
  },

  onVenueMappingInput(e) {
    const idx = e.currentTarget.dataset.index
    const venueMapping = this.data.venueMapping
    venueMapping[idx] = e.detail.value
    this.setData({ venueMapping })
  },

  onStartTimeInput(e) {
    this.setData({ startTime: e.detail.value })
  },

  onGroupMinutesInput(e) {
    this.setData({ groupMatchMinutes: parseInt(e.detail.value || '12', 10) })
  },

  onKnockoutMinutesInput(e) {
    this.setData({ knockoutMatchMinutes: parseInt(e.detail.value || '20', 10) })
  },

  onBreakMinutesInput(e) {
    this.setData({ breakMinutes: parseInt(e.detail.value || '3', 10) })
  },

  onTemplateChange(e) {
    const templateIndex = parseInt(e.detail.value, 10)
    const templateMap = ['group', 'league', 'custom']
    this.setData({
      templateIndex,
      templateType: templateMap[templateIndex] || 'group'
    }, () => this.syncTemplateState())
  },

  onCustomUseGroupsChange(e) {
    this.setData({ customUseGroups: !!e.detail.value }, () => this.syncTemplateState())
  },

  onCustomLegsChange(e) {
    const customLegsIndex = parseInt(e.detail.value, 10)
    const customLegs = this.data.customLegsOptions[customLegsIndex] || 1
    this.setData({ customLegsIndex, customLegs })
  },

  onCustomEnableKnockoutChange(e) {
    this.setData({ customEnableKnockout: !!e.detail.value })
  },

  // 选择队伍数量
  onTeamCountChange(e) {
    const count = this.data.teamCountOptions[e.detail.value]
    this.initTeams(count)
  },

  // 球队名称输入
  onTeamNameInput(e) {
    const idx = e.currentTarget.dataset.index
    const teams = this.data.teams
    teams[idx].name = e.detail.value
    this.setData({ teams })
  },

  // 打开球员管理弹窗
  openPlayerModal(e) {
    const idx = e.currentTarget.dataset.index
    this.setData({ currentTeamIndex: idx, showPlayerModal: true })
  },

  // 关闭球员弹窗
  closePlayerModal() {
    this.setData({ showPlayerModal: false, newPlayerName: '', newPlayerNumber: '' })
  },

  // 阻止弹窗内点击冒泡到遮罩层
  noop() {},

  // 新球员姓名输入
  onPlayerNameInput(e) {
    this.setData({ newPlayerName: e.detail.value })
  },

  // 新球员号码输入
  onPlayerNumberInput(e) {
    this.setData({ newPlayerNumber: e.detail.value })
  },

  // 添加球员
  addPlayer() {
    const { newPlayerName, newPlayerNumber, currentTeamIndex, teams } = this.data
    if (!newPlayerName.trim()) {
      wx.showToast({ title: '请输入球员姓名', icon: 'none' })
      return
    }
    teams[currentTeamIndex].players.push({
      name: newPlayerName.trim(),
      number: newPlayerNumber.trim() || '0'
    })
    this.setData({ teams, newPlayerName: '', newPlayerNumber: '' })
  },

  // 删除球员
  removePlayer(e) {
    const { teamIndex, playerIndex } = e.currentTarget.dataset
    const teams = this.data.teams
    teams[teamIndex].players.splice(playerIndex, 1)
    this.setData({ teams })
  },

  // === 步骤1 → 步骤2：进入分组 ===
  goToGrouping() {
    const {
      name,
      teams,
      teamCount,
      venueText,
      startTime,
      groupMatchMinutes,
      knockoutMatchMinutes,
      breakMinutes
    } = this.data

    if (!name.trim()) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' })
      return
    }

    for (let i = 0; i < teamCount; i++) {
      if (!teams[i].name.trim()) {
        wx.showToast({ title: `请输入第${i + 1}支球队名称`, icon: 'none' })
        return
      }
    }

    const names = teams.slice(0, teamCount).map(t => t.name.trim())
    if (new Set(names).size !== names.length) {
      wx.showToast({ title: '球队名称不能重复', icon: 'none' })
      return
    }

    const venues = (venueText || '')
      .split(/\n|,|，/)
      .map(s => s.trim())
      .filter(Boolean)

    if (venues.length === 0) {
      wx.showToast({ title: '请至少填写1个场地', icon: 'none' })
      return
    }

    if (!/^(\d{1,2}):(\d{2})$/.test(startTime || '')) {
      wx.showToast({ title: '开赛时间格式应为 HH:mm', icon: 'none' })
      return
    }

    if (!(groupMatchMinutes > 0) || !(knockoutMatchMinutes > 0) || breakMinutes < 0) {
      wx.showToast({ title: '请检查时长与间隔配置', icon: 'none' })
      return
    }

    const templateConfig = this.getTemplateConfig()
    if (!templateConfig.useGroups) {
      this.submitTournament(null, templateConfig)
      return
    }

    // 初始化分组状态：所有球队未分配
    const unassigned = []
    for (let i = 0; i < teamCount; i++) {
      unassigned.push(i)
    }

    this.setData({ step: 2, groupA: [], groupB: [], unassigned })
  },

  // 返回步骤1
  goBackToStep1() {
    this.setData({ step: 1 })
  },

  // 将球队分配到 A 组
  assignToA(e) {
    const idx = e.currentTarget.dataset.index
    const { groupA, groupB, unassigned, teamCount } = this.data
    const half = teamCount / 2

    if (groupA.length >= half) {
      wx.showToast({ title: `A组已满（最多${half}队）`, icon: 'none' })
      return
    }

    // 从未分配或B组中移除
    const uIdx = unassigned.indexOf(idx)
    if (uIdx >= 0) unassigned.splice(uIdx, 1)
    const bIdx = groupB.indexOf(idx)
    if (bIdx >= 0) groupB.splice(bIdx, 1)

    groupA.push(idx)
    this.setData({ groupA, groupB, unassigned })
  },

  // 将球队分配到 B 组
  assignToB(e) {
    const idx = e.currentTarget.dataset.index
    const { groupA, groupB, unassigned, teamCount } = this.data
    const half = teamCount / 2

    if (groupB.length >= half) {
      wx.showToast({ title: `B组已满（最多${half}队）`, icon: 'none' })
      return
    }

    // 从未分配或A组中移除
    const uIdx = unassigned.indexOf(idx)
    if (uIdx >= 0) unassigned.splice(uIdx, 1)
    const aIdx = groupA.indexOf(idx)
    if (aIdx >= 0) groupA.splice(aIdx, 1)

    groupB.push(idx)
    this.setData({ groupA, groupB, unassigned })
  },

  // 将球队移回未分配
  unassignTeam(e) {
    const idx = e.currentTarget.dataset.index
    const { groupA, groupB, unassigned } = this.data

    const aIdx = groupA.indexOf(idx)
    if (aIdx >= 0) groupA.splice(aIdx, 1)
    const bIdx = groupB.indexOf(idx)
    if (bIdx >= 0) groupB.splice(bIdx, 1)

    unassigned.push(idx)
    this.setData({ groupA, groupB, unassigned })
  },

  // 随机分配剩余未分配的球队
  randomAssign() {
    const { groupA, groupB, unassigned, teamCount } = this.data
    const half = teamCount / 2

    if (unassigned.length === 0) {
      wx.showToast({ title: '没有需要分配的球队', icon: 'none' })
      return
    }

    // 打乱未分配列表
    const shuffled = [...unassigned].sort(() => Math.random() - 0.5)

    shuffled.forEach(idx => {
      if (groupA.length < half) {
        groupA.push(idx)
      } else {
        groupB.push(idx)
      }
    })

    this.setData({ groupA, groupB, unassigned: [] })
  },

  // 创建赛事
  onSubmit() {
    const templateConfig = this.getTemplateConfig()
    if (!templateConfig.useGroups) {
      this.submitTournament(null, templateConfig)
      return
    }

    const {
      teamCount,
      groupA,
      groupB,
      unassigned
    } = this.data
    const half = teamCount / 2

    if (unassigned.length > 0) {
      wx.showToast({ title: '还有球队未分组', icon: 'none' })
      return
    }

    if (groupA.length !== half || groupB.length !== half) {
      wx.showToast({ title: '每组必须有' + half + '支球队', icon: 'none' })
      return
    }

    const preGroups = { A: groupA, B: groupB }
    this.submitTournament(preGroups, templateConfig)
  },

  /**
   * 使用模板创建赛事（简化流程：只需名称+映射）
   */
  submitFromTemplate() {
    const { name, teams, teamCount, venueMapping, templateId } = this.data

    if (!name.trim()) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' })
      return
    }

    // 验证球队名称
    for (let i = 0; i < teamCount; i++) {
      if (!teams[i].name.trim()) {
        wx.showToast({ title: `请输入队伍${i + 1}的名称`, icon: 'none' })
        return
      }
    }

    const names = teams.slice(0, teamCount).map(t => t.name.trim())
    if (new Set(names).size !== names.length) {
      wx.showToast({ title: '球队名称不能重复', icon: 'none' })
      return
    }

    // 验证场地名称
    for (let i = 0; i < venueMapping.length; i++) {
      if (!venueMapping[i].trim()) {
        wx.showToast({ title: `请输入场地${i + 1}的名称`, icon: 'none' })
        return
      }
    }

    // 场地名称列表
    const venueNames = venueMapping.map(v => v.trim())

    try {
      tournament.createTournamentFromTemplate(
        templateId,
        name.trim(),
        teams.slice(0, teamCount),
        teamCount,
        null, // 无需分组
        venueNames
      )
    } catch (err) {
      wx.showToast({ title: err.message || '创建失败', icon: 'error' })
      return
    }

    wx.showToast({ title: '创建成功', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 1500)
  },

  submitTournament(preGroups, templateConfig) {
    const {
      name,
      teams,
      teamCount,
      venueText,
      startTime,
      groupMatchMinutes,
      knockoutMatchMinutes,
      breakMinutes
    } = this.data
    const venues = (venueText || '')
      .split(/\n|,|，/)
      .map(s => s.trim())
      .filter(Boolean)
    const scheduleConfig = {
      venues,
      startTime,
      groupMatchMinutes,
      knockoutMatchMinutes,
      breakMinutes
    }

     // 如果从模板创建且模板有编排数据，使用 createTournamentFromTemplate
     if (this.data.fromTemplate && this.data.templateId) {
       try {
         tournament.createTournamentFromTemplate(
           this.data.templateId,
           name.trim(),
           teams.slice(0, teamCount),
           teamCount,
           preGroups
         )
       } catch (err) {
         wx.showToast({ title: err.message || '创建失败', icon: 'error' })
         return
       }
     } else {
       // 正常创建
       const finalTemplateConfig = templateConfig
       tournament.createTournament(
         name.trim(),
         teams.slice(0, teamCount),
         teamCount,
         preGroups,
         {
           scheduleConfig,
           templateConfig: finalTemplateConfig
         }
       )
     }

     // 获取刚创建的赛事
     const createdTournament = tournament.getCurrentTournament()

     // 如果从模板创建，直接跳转到编排页面让用户确认/修改
     if (this.data.fromTemplate && createdTournament) {
       wx.showToast({ title: '赛事已创建，请确认编排', icon: 'success' })
       setTimeout(() => {
         wx.navigateTo({
           url: `/packageMatch/pages/arrange/arrange?tournamentId=${createdTournament.id}`
         })
       }, 1500)
     } else {
       wx.showToast({ title: '创建成功', icon: 'success' })
       setTimeout(() => {
         wx.switchTab({ url: '/pages/index/index' })
       }, 1500)
     }
  }
})
