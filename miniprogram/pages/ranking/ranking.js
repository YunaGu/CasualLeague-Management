const tournament = require('../../utils/tournament')

Page({
  data: {
    currentTournament: null,
    standings: null,
    groups: [],
    advancementRules: [],
    rulesTitle: '晋级规则',
    qualifiedCount: 0
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

    const standings = tournament.calculateGroupStandings(current)
    const groups = Object.keys(standings).map(name => ({
      name,
      teams: standings[name]
    }))
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
          '各组按积分、净胜球、进球数排序。',
          '当前模版不生成排位赛，最终名次以积分榜为准。'
        ]
      }

      return [
        '所有队伍按总榜积分排序。',
        '同分排名顺序：积分 > 净胜球 > 进球数。'
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

    rules.push('小组同分排名顺序：积分 > 净胜球 > 进球数。')
    return rules
  }
})
