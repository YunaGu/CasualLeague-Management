const tournament = require('../../utils/tournament')

Page({
  data: {
    step: 1, // 1: 填写信息, 2: 分组
    name: '',
    teamCount: 6,
    teamCountOptions: [6, 8, 10],
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
    unassigned: []   // 未分配的球队索引
  },

  onLoad() {
    this.initTeams(6)
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
    const {
      name,
      teams,
      teamCount,
      groupA,
      groupB,
      unassigned,
      venueText,
      startTime,
      groupMatchMinutes,
      knockoutMatchMinutes,
      breakMinutes
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
    tournament.createTournament(
      name.trim(),
      teams.slice(0, teamCount),
      teamCount,
      preGroups,
      { scheduleConfig }
    )

    wx.showToast({ title: '创建成功', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' })
    }, 1500)
  }
})
