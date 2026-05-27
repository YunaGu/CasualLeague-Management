const tournament = require('../../utils/tournament')

Page({
  data: {
    currentTournament: null,
    standings: null,
    groups: [],
    advancementRules: []
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

    this.setData({
      currentTournament: current,
      standings,
      groups,
      advancementRules
    })
  },

  buildAdvancementRules(currentTournament) {
    if (!currentTournament || !currentTournament.groups || currentTournament.groups.length < 2) {
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
