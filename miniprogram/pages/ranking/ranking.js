const tournament = require('../../utils/tournament')
const share = require('../../utils/share')

Page({
  data: {
    currentTournament: null,
    standings: null,
    groups: [],
    advancementRules: [],
    rulesTitle: '晋级规则',
    qualifiedCount: 0,
    isAdmin: false
  },

  onLoad(options) {
    this.shareOptions = options || {}
    share.enableShareMenu()
  },

  async onShow() {
    try {
      await tournament.syncTournamentsFromCloud()
    } catch (error) {
      console.error('排名同步失败', error)
      wx.showToast({ title: '云同步失败', icon: 'none' })
    }
    share.applySharedTournament(this.shareOptions)
    this.shareOptions = null
    this.setData({ isAdmin: tournament.canManageTournaments() })
    this.loadData()
  },

  onShareAppMessage() {
    return share.buildAppMessage(this.data.currentTournament, {
      section: '最新积分排名',
      pagePath: '/pages/ranking/ranking'
    })
  },

  onShareTimeline() {
    return share.buildTimeline(this.data.currentTournament, {
      section: '最新积分排名'
    })
  },

  loadData() {
    const current = tournament.getCurrentTournament()
    if (!current) {
      this.setData({ currentTournament: null })
      return
    }

    const standings = tournament.calculateGroupStandings(current)
    const groups = Object.keys(standings).map(name => {
      const teams = standings[name]
      const pendingByKey = {}
      teams
        .filter(team => team.rankPending && team.tieKey)
        .forEach(team => {
          if (!pendingByKey[team.tieKey]) pendingByKey[team.tieKey] = []
          pendingByKey[team.tieKey].push(team.teamName)
        })
      const tieNotices = Object.keys(pendingByKey)
        .map(key => `${pendingByKey[key].join('、')} 完全同分`)

      return {
        name,
        teams,
        hasPendingRank: tieNotices.length > 0,
        tieNotices
      }
    })
    const advancementRules = this.buildAdvancementRules(current)
    const qualifiedCount = this.getQualifiedCount(current)
    const rulesTitle = current.templateConfig && current.templateConfig.enableKnockout ? '晋级规则' : '排名说明'

    this.setData({
      currentTournament: current,
      standings,
      groups,
      advancementRules,
      rulesTitle,
      qualifiedCount
    })
  },

  resolveRankingTies(e) {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可以确认名次', icon: 'none' })
      return
    }
    const groupName = e.currentTarget.dataset.group
    const current = this.data.currentTournament
    if (!current || !groupName) return

    wx.showModal({
      title: '抽签确定名次',
      content: '系统将为该组仍完全同分的球队随机抽签并保存结果。确认后可能生成后续淘汰赛对阵。',
      confirmText: '确认抽签',
      success: (res) => {
        if (!res.confirm) return
        const result = tournament.resolveRankingTies(current.id, groupName)
        if (!result) {
          wx.showToast({ title: '当前没有待抽签球队', icon: 'none' })
          return
        }
        wx.showToast({ title: '抽签完成', icon: 'success' })
        this.loadData()
      }
    })
  },

  getQualifiedCount(currentTournament) {
    const templateConfig = currentTournament ? currentTournament.templateConfig : null
    const teamCount = currentTournament ? (currentTournament.teamCount || ((currentTournament.teams || []).length)) : 0

    if (templateConfig && templateConfig.enableKnockout === false) return 0
    if (currentTournament && currentTournament.groups && currentTournament.groups.length < 2) return 0
    if (teamCount === 10) return 1
    return 2
  },

  buildAdvancementRules(currentTournament) {
    if (!currentTournament) {
      return []
    }

    const templateConfig = currentTournament.templateConfig || {
      useGroups: !!(currentTournament.groups && currentTournament.groups.length >= 2),
      enableKnockout: !!(currentTournament.groups && currentTournament.groups.length >= 2)
    }

    if (!templateConfig.enableKnockout) {
      if (templateConfig.useGroups) {
        return [
          '各组同分顺序：积分 > 净胜球 > 进球数 > 相互战绩 > 公平竞赛分。',
          '相互战绩比较同分球队间的积分、净胜球和进球数；公平竞赛分为黄牌1分、红牌3分，分数少者优先，仍相同则抽签。',
          '当前模版不生成排位赛，最终名次以积分榜为准。'
        ]
      }

      return [
        '所有队伍按总榜积分排序。',
        '同分顺序：积分 > 净胜球 > 进球数 > 相互战绩 > 公平竞赛分。',
        '相互战绩比较同分球队间的积分、净胜球和进球数；公平竞赛分为黄牌1分、红牌3分，分数少者优先，仍相同则抽签。'
      ]
    }

    if (!currentTournament.groups || currentTournament.groups.length < 2) {
      return []
    }

    const teamCount = currentTournament.teamCount || ((currentTournament.teams || []).length)
    const rules = []

    if (teamCount === 10) {
      rules.push('1-2名：A1 对 B1（冠亚军决赛）。')
      rules.push('3-4名：A2 对 B2。')
      rules.push('5-6名：A3 对 B3。')
      rules.push('7-8名：A4 对 B4。')
      rules.push('9-10名：A5 对 B5。')
    } else if (teamCount === 8) {
      rules.push('1-4名路径：A1 对 B2，B1 对 A2；胜者争1-2名，负者争3-4名。')
      rules.push('5-8名路径：A3 对 B4，B3 对 A4；胜者争5-6名，负者争7-8名。')
    } else {
      rules.push('各小组前2名晋级半决赛：A1 对 B2，B1 对 A2。')
      rules.push('半决赛胜者进入冠亚军决赛，负者进入三四名决赛。')
      rules.push('各小组第3名进行五六名排位赛（A3 对 B3）。')
    }

    rules.push('小组同分顺序：积分 > 净胜球 > 进球数 > 相互战绩 > 公平竞赛分。')
    rules.push('相互战绩比较同分球队间的积分、净胜球和进球数；公平竞赛分为黄牌1分、红牌3分，分数少者优先，仍相同则抽签。')
    return rules
  }
})
