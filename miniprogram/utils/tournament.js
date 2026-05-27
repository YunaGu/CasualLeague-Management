/**
 * 赛事核心逻辑模块
 * 包含赛程生成、排名计算、数据存储等功能
 */

const STORAGE_KEY = 'FOOTBALL_TOURNAMENTS'

/**
 * 生成唯一 ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function parseTimeToMinutes(text) {
  if (!text || typeof text !== 'string') return 9 * 60
  const matched = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!matched) return 9 * 60
  const hour = parseInt(matched[1], 10)
  const minute = parseInt(matched[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 9 * 60
  return hour * 60 + minute
}

function formatMinutes(total) {
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeScheduleConfig(config) {
  const rawVenues = config && Array.isArray(config.venues) ? config.venues : []
  const venues = rawVenues.length > 0
    ? rawVenues.map((name, idx) => ({ id: `venue_${idx + 1}`, name: String(name).trim() })).filter(v => v.name)
    : [{ id: 'venue_1', name: '1号场' }, { id: 'venue_2', name: '2号场' }]

  return {
    venues,
    startTime: config && config.startTime ? config.startTime : '09:00',
    breakMinutes: config && config.breakMinutes ? parseInt(config.breakMinutes, 10) : 3,
    groupMatchMinutes: config && config.groupMatchMinutes ? parseInt(config.groupMatchMinutes, 10) : 12,
    knockoutMatchMinutes: config && config.knockoutMatchMinutes ? parseInt(config.knockoutMatchMinutes, 10) : 20
  }
}

function getLatestScheduleMinute(tournament) {
  let latest = parseTimeToMinutes(tournament.scheduleConfig.startTime)
  ;(tournament.matches || []).forEach(match => {
    if (typeof match.endMinute === 'number' && match.endMinute > latest) {
      latest = match.endMinute
    }
  })
  return latest
}

function applyStageSchedule(tournament, stage, options = {}) {
  const cfg = tournament.scheduleConfig
  const venues = cfg.venues
  const duration = options.duration || cfg.groupMatchMinutes
  const breakMinutes = cfg.breakMinutes
  const stageMatches = (tournament.matches || [])
    .filter(m => m.stage === stage)
    .sort((a, b) => {
      if ((a.round || 0) !== (b.round || 0)) return (a.round || 0) - (b.round || 0)
      return a.id > b.id ? 1 : -1
    })

  if (stageMatches.length === 0) return

  let cursor = typeof options.startMinute === 'number'
    ? options.startMinute
    : parseTimeToMinutes(cfg.startTime)

  if (stage === 'group') {
    const roundMap = {}
    stageMatches.forEach(match => {
      if (!roundMap[match.round]) roundMap[match.round] = []
      roundMap[match.round].push(match)
    })

    Object.keys(roundMap)
      .map(r => parseInt(r, 10))
      .sort((a, b) => a - b)
      .forEach(round => {
        const roundMatches = roundMap[round]
        roundMatches.forEach((match, idx) => {
          if (match.lockedSchedule) return
          const venue = venues[idx % venues.length]
          match.venueId = venue.id
          match.venueName = venue.name
          match.startMinute = cursor
          match.endMinute = cursor + duration
          match.startTimeText = formatMinutes(match.startMinute)
          match.endTimeText = formatMinutes(match.endMinute)
        })
        cursor += duration + breakMinutes
      })
    return
  }

  // 淘汰赛按顺序排入时段，同一时段可并行使用多个场地
  for (let i = 0; i < stageMatches.length; i += venues.length) {
    const slotMatches = stageMatches.slice(i, i + venues.length)
    slotMatches.forEach((match, idx) => {
      if (match.lockedSchedule) return
      const venue = venues[idx]
      match.venueId = venue.id
      match.venueName = venue.name
      match.startMinute = cursor
      match.endMinute = cursor + duration
      match.startTimeText = formatMinutes(match.startMinute)
      match.endTimeText = formatMinutes(match.endMinute)
    })
    cursor += duration + breakMinutes
  }
}

/**
 * 获取所有赛事
 */
function getTournaments() {
  return wx.getStorageSync(STORAGE_KEY) || []
}

/**
 * 获取当前赛事
 */
function getCurrentTournament() {
  const tournaments = getTournaments()
  const currentId = wx.getStorageSync('CURRENT_TOURNAMENT_ID')
  return tournaments.find(t => t.id === currentId) || null
}

/**
 * 保存赛事列表
 */
function saveTournaments(tournaments) {
  wx.setStorageSync(STORAGE_KEY, tournaments)
}

/**
 * 保存单个赛事（更新）
 */
function saveTournament(tournament) {
  const tournaments = getTournaments()
  const idx = tournaments.findIndex(t => t.id === tournament.id)
  if (idx >= 0) {
    tournaments[idx] = tournament
  } else {
    tournaments.push(tournament)
  }
  saveTournaments(tournaments)
}

/**
 * 设置当前赛事
 */
function setCurrentTournament(id) {
  wx.setStorageSync('CURRENT_TOURNAMENT_ID', id)
}

/**
 * 创建赛事
 * @param {string} name - 赛事名称
 * @param {Array} teams - 球队列表 [{name, players: [{name, number}]}]
 * @param {number} teamCount - 队伍数量 (6/8/10)
 */
/**
 * 创建赛事
 * @param {string} name - 赛事名称
 * @param {Array} teams - 球队列表 [{name, players: [{name, number}]}]
 * @param {number} teamCount - 队伍数量 (6/8/10)
 * @param {Object} preGroups - 预定义分组 { A: [teamIndex...], B: [teamIndex...] }，可选
 */
function createTournament(name, teams, teamCount, preGroups, options) {
  const scheduleConfig = normalizeScheduleConfig(options && options.scheduleConfig)
  const tournament = {
    id: generateId(),
    name,
    teamCount,
    teams: teams.map(t => ({
      id: generateId(),
      name: t.name,
      players: (t.players || []).map(p => ({
        id: generateId(),
        name: p.name,
        number: p.number
      }))
    })),
    groups: [],
    matches: [],
    scheduleConfig,
    stage: 'group', // group, semi, third, final, finished
    createdAt: Date.now()
  }

  // 分组：如果有预定义分组则使用，否则随机
  if (preGroups) {
    tournament.groups = [
      { name: 'A', teams: preGroups.A.map(idx => tournament.teams[idx].id) },
      { name: 'B', teams: preGroups.B.map(idx => tournament.teams[idx].id) }
    ]
  } else {
    tournament.groups = generateGroups(tournament.teams, teamCount)
  }
  // 生成小组赛赛程
  tournament.matches = generateGroupMatches(tournament)
  applyStageSchedule(tournament, 'group', {
    startMinute: parseTimeToMinutes(scheduleConfig.startTime),
    duration: scheduleConfig.groupMatchMinutes
  })

  saveTournament(tournament)
  setCurrentTournament(tournament.id)
  return tournament
}

/**
 * 分组逻辑
 * 6队: A组3队 + B组3队
 * 8队: A组4队 + B组4队
 * 10队: A组5队 + B组5队
 */
function generateGroups(teams, teamCount) {
  const half = teamCount / 2
  const shuffled = [...teams].sort(() => Math.random() - 0.5)
  return [
    { name: 'A', teams: shuffled.slice(0, half).map(t => t.id) },
    { name: 'B', teams: shuffled.slice(half, teamCount).map(t => t.id) }
  ]
}

/**
 * 生成小组赛赛程（双循环：主客场各一次）
 */
function generateGroupMatches(tournament) {
  const matches = []

  tournament.groups.forEach(group => {
    const firstLegRounds = buildRoundRobinRounds(group.teams)
    const firstLegCount = firstLegRounds.length

    // 第一循环
    firstLegRounds.forEach((roundPairs, roundIndex) => {
      roundPairs.forEach(pair => {
        matches.push({
          id: generateId(),
          stage: 'group',
          group: group.name,
          round: roundIndex + 1,
          homeTeam: pair.homeTeam,
          awayTeam: pair.awayTeam,
          homeScore: null,
          awayScore: null,
          events: [],
          status: 'pending', // pending, playing, finished
          startTime: null,
          venueId: null,
          venueName: '',
          startMinute: null,
          endMinute: null,
          startTimeText: '',
          endTimeText: '',
          lockedSchedule: false
        })
      })
    })

    // 第二循环（反转主客）
    firstLegRounds.forEach((roundPairs, roundIndex) => {
      roundPairs.forEach(pair => {
        matches.push({
          id: generateId(),
          stage: 'group',
          group: group.name,
          round: firstLegCount + roundIndex + 1,
          homeTeam: pair.awayTeam,
          awayTeam: pair.homeTeam,
          homeScore: null,
          awayScore: null,
          events: [],
          status: 'pending',
          startTime: null,
          venueId: null,
          venueName: '',
          startMinute: null,
          endMinute: null,
          startTimeText: '',
          endTimeText: '',
          lockedSchedule: false
        })
      })
    })
  })

  // 同轮次聚合后再按轮次排序
  return matches.sort((a, b) => a.round - b.round)
}

/**
 * 为单个小组构建循环赛轮次（每轮同一球队最多一场）
 */
function buildRoundRobinRounds(teamIds) {
  const teams = [...teamIds]

  // 奇数队时加入轮空位（null）
  if (teams.length % 2 !== 0) {
    teams.push(null)
  }

  const n = teams.length
  const totalRounds = n - 1
  const half = n / 2
  const rounds = []

  // 圆圈法排程
  for (let round = 0; round < totalRounds; round++) {
    const pairs = []

    for (let i = 0; i < half; i++) {
      const t1 = teams[i]
      const t2 = teams[n - 1 - i]

      // 命中轮空位则跳过
      if (!t1 || !t2) continue

      // 交替主客，降低主客偏差
      const isEvenRound = round % 2 === 0
      pairs.push({
        homeTeam: isEvenRound ? t1 : t2,
        awayTeam: isEvenRound ? t2 : t1
      })
    }

    rounds.push(pairs)

    // 固定首位，其余顺时针轮转
    const fixed = teams[0]
    const rotated = [fixed, teams[n - 1], ...teams.slice(1, n - 1)]
    for (let i = 0; i < n; i++) {
      teams[i] = rotated[i]
    }
  }

  return rounds
}

/**
 * 计算小组排名
 * @returns {Object} { A: [...], B: [...] }
 */
function calculateGroupStandings(tournament) {
  const standings = {}

  tournament.groups.forEach(group => {
    const teamStats = group.teams.map(teamId => {
      const team = tournament.teams.find(t => t.id === teamId)
      const stats = {
        teamId,
        teamName: team ? team.name : '未知',
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      }

      // 统计该队的比赛结果
      tournament.matches
        .filter(m => m.stage === 'group' && m.group === group.name && m.status === 'finished')
        .forEach(match => {
          if (match.homeTeam === teamId) {
            stats.played++
            stats.goalsFor += match.homeScore
            stats.goalsAgainst += match.awayScore
            if (match.homeScore > match.awayScore) {
              stats.won++
              stats.points += 3
            } else if (match.homeScore === match.awayScore) {
              stats.drawn++
              stats.points += 1
            } else {
              stats.lost++
            }
          } else if (match.awayTeam === teamId) {
            stats.played++
            stats.goalsFor += match.awayScore
            stats.goalsAgainst += match.homeScore
            if (match.awayScore > match.homeScore) {
              stats.won++
              stats.points += 3
            } else if (match.awayScore === match.homeScore) {
              stats.drawn++
              stats.points += 1
            } else {
              stats.lost++
            }
          }
        })

      stats.goalDifference = stats.goalsFor - stats.goalsAgainst
      return stats
    })

    // 排序：积分 > 净胜球 > 进球数
    teamStats.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
      return b.goalsFor - a.goalsFor
    })

    standings[group.name] = teamStats
  })

  return standings
}

/**
 * 检查小组赛是否结束
 */
function isGroupStageComplete(tournament) {
  const groupMatches = tournament.matches.filter(m => m.stage === 'group')
  return groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished')
}

function isKnockoutStage(stage) {
  return stage && stage !== 'group'
}

function createPlacementMatch({ stage, matchLabel, homeTeam, awayTeam }) {
  return {
    id: generateId(),
    stage,
    group: null,
    round: null,
    matchLabel,
    homeTeam,
    awayTeam,
    homeScore: null,
    awayScore: null,
    events: [],
    status: 'pending',
    startTime: null,
    venueId: null,
    venueName: '',
    startMinute: null,
    endMinute: null,
    startTimeText: '',
    endTimeText: '',
    lockedSchedule: false
  }
}

function getGroupRankTeamId(standings, groupName, rank) {
  const group = standings[groupName] || []
  const item = group[rank - 1]
  return item ? item.teamId : null
}

function schedulePlacementStages(tournament, stageOrder) {
  stageOrder.forEach(stage => {
    applyStageSchedule(tournament, stage, {
      startMinute: getLatestScheduleMinute(tournament) + tournament.scheduleConfig.breakMinutes,
      duration: tournament.scheduleConfig.knockoutMatchMinutes
    })
  })
}

function resolveMatchWinnerTeamId(match) {
  if (match.homeScore > match.awayScore) return match.homeTeam
  if (match.awayScore > match.homeScore) return match.awayTeam

  const hasPenalty = typeof match.penaltyHomeScore === 'number' && typeof match.penaltyAwayScore === 'number'
  if (!hasPenalty) return null
  if (match.penaltyHomeScore > match.penaltyAwayScore) return match.homeTeam
  if (match.penaltyAwayScore > match.penaltyHomeScore) return match.awayTeam
  return null
}

/**
 * 生成排位赛赛程（按队伍数量）
 * 6队：A3vsB3，A1vsB2，B1vsA2，随后三四名/冠亚军
 * 8队：A1vsB2，B1vsA2，A3vsB4，B3vsA4，随后1-4与5-8各自产生最终名次
 * 10队：直接进行1-2、3-4、5-6、7-8、9-10排位赛
 */
function generateKnockoutMatches(tournament) {
  const existingPlacement = (tournament.matches || []).some(m => m.stage !== 'group')
  if (existingPlacement) return tournament

  const standings = calculateGroupStandings(tournament)
  const teamCount = tournament.teamCount || ((tournament.teams || []).length)

  const a1 = getGroupRankTeamId(standings, 'A', 1)
  const a2 = getGroupRankTeamId(standings, 'A', 2)
  const a3 = getGroupRankTeamId(standings, 'A', 3)
  const a4 = getGroupRankTeamId(standings, 'A', 4)
  const a5 = getGroupRankTeamId(standings, 'A', 5)
  const b1 = getGroupRankTeamId(standings, 'B', 1)
  const b2 = getGroupRankTeamId(standings, 'B', 2)
  const b3 = getGroupRankTeamId(standings, 'B', 3)
  const b4 = getGroupRankTeamId(standings, 'B', 4)
  const b5 = getGroupRankTeamId(standings, 'B', 5)

  if (teamCount === 10) {
    tournament.matches.push(createPlacementMatch({
      stage: 'final',
      matchLabel: '冠亚军决赛',
      homeTeam: a1,
      awayTeam: b1
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'third',
      matchLabel: '三四名决赛',
      homeTeam: a2,
      awayTeam: b2
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'fifth',
      matchLabel: '五六名排位赛',
      homeTeam: a3,
      awayTeam: b3
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'seventh',
      matchLabel: '七八名排位赛',
      homeTeam: a4,
      awayTeam: b4
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'ninth',
      matchLabel: '九十名排位赛',
      homeTeam: a5,
      awayTeam: b5
    }))
    schedulePlacementStages(tournament, ['final', 'third', 'fifth', 'seventh', 'ninth'])
    tournament.stage = 'placement'
    saveTournament(tournament)
    return tournament
  }

  if (teamCount === 8) {
    tournament.matches.push(createPlacementMatch({
      stage: 'semi',
      matchLabel: '半决赛1',
      homeTeam: a1,
      awayTeam: b2
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'semi',
      matchLabel: '半决赛2',
      homeTeam: b1,
      awayTeam: a2
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'place5semi',
      matchLabel: '5-8名排位赛1',
      homeTeam: a3,
      awayTeam: b4
    }))
    tournament.matches.push(createPlacementMatch({
      stage: 'place5semi',
      matchLabel: '5-8名排位赛2',
      homeTeam: b3,
      awayTeam: a4
    }))
    schedulePlacementStages(tournament, ['place5semi', 'semi'])
    tournament.stage = 'semi'
    saveTournament(tournament)
    return tournament
  }

  // 6队规则（原逻辑）
  tournament.matches.push(createPlacementMatch({
    stage: 'fifth',
    matchLabel: '五六名排位赛',
    homeTeam: a3,
    awayTeam: b3
  }))
  tournament.matches.push(createPlacementMatch({
    stage: 'semi',
    matchLabel: '半决赛1',
    homeTeam: a1,
    awayTeam: b2
  }))
  tournament.matches.push(createPlacementMatch({
    stage: 'semi',
    matchLabel: '半决赛2',
    homeTeam: b1,
    awayTeam: a2
  }))
  schedulePlacementStages(tournament, ['fifth', 'semi'])
  tournament.stage = 'semi'
  saveTournament(tournament)
  return tournament
}

function generateLowerPlacementMatchesForEight(tournament) {
  const played = tournament.matches.filter(m => m.stage === 'place5semi' && m.status === 'finished')
  if (played.length < 2) return tournament

  const exists = tournament.matches.some(m => m.stage === 'fifth' || m.stage === 'seventh')
  if (exists) return tournament

  const winners = []
  const losers = []
  played.forEach(match => {
    const winner = resolveMatchWinnerTeamId(match)
    if (!winner) return
    const loser = winner === match.homeTeam ? match.awayTeam : match.homeTeam
    winners.push(winner)
    losers.push(loser)
  })
  if (winners.length < 2 || losers.length < 2) return tournament

  tournament.matches.push(createPlacementMatch({
    stage: 'fifth',
    matchLabel: '五六名决赛',
    homeTeam: winners[0],
    awayTeam: winners[1]
  }))
  tournament.matches.push(createPlacementMatch({
    stage: 'seventh',
    matchLabel: '七八名决赛',
    homeTeam: losers[0],
    awayTeam: losers[1]
  }))

  schedulePlacementStages(tournament, ['fifth', 'seventh'])
  saveTournament(tournament)
  return tournament
}

/**
 * 半决赛结束后生成三四名和决赛
 */
function generateFinalMatches(tournament) {
  const semiMatches = tournament.matches.filter(m => m.stage === 'semi' && m.status === 'finished')
  if (semiMatches.length < 2) return tournament

  const exists = tournament.matches.some(m => m.stage === 'third' || m.stage === 'final')
  if (exists) return tournament

  const winners = []
  const losers = []

  semiMatches.forEach(match => {
    const winnerTeamId = resolveMatchWinnerTeamId(match)
    if (!winnerTeamId) return
    const loserTeamId = winnerTeamId === match.homeTeam ? match.awayTeam : match.homeTeam
    winners.push(winnerTeamId)
    losers.push(loserTeamId)
  })

  if (winners.length < 2 || losers.length < 2) return tournament

  tournament.matches.push(createPlacementMatch({
    stage: 'third',
    matchLabel: '三四名决赛',
    homeTeam: losers[0],
    awayTeam: losers[1]
  }))
  tournament.matches.push(createPlacementMatch({
    stage: 'final',
    matchLabel: '冠亚军决赛',
    homeTeam: winners[0],
    awayTeam: winners[1]
  }))

  schedulePlacementStages(tournament, ['third', 'final'])

  tournament.stage = 'final'
  saveTournament(tournament)
  return tournament
}

function areAllPlacementMatchesFinished(tournament) {
  const placementMatches = (tournament.matches || []).filter(m => m.stage !== 'group')
  return placementMatches.length > 0 && placementMatches.every(m => m.status === 'finished')
}

function updateMatchSchedule(tournamentId, matchId, payload) {
  const tournaments = getTournaments()
  const tournament = tournaments.find(t => t.id === tournamentId)
  if (!tournament) return null

  const match = tournament.matches.find(m => m.id === matchId)
  if (!match) return null

  if (payload.venueId) match.venueId = payload.venueId
  if (payload.venueName) match.venueName = payload.venueName

  if (payload.startTimeText) {
    const startMinute = parseTimeToMinutes(payload.startTimeText)
    const isGroup = match.stage === 'group'
    const defaultDuration = isGroup
      ? tournament.scheduleConfig.groupMatchMinutes
      : tournament.scheduleConfig.knockoutMatchMinutes
    const parsedDuration = payload && payload.durationMinutes != null
      ? parseInt(payload.durationMinutes, 10)
      : defaultDuration
    const duration = Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : defaultDuration
    match.startMinute = startMinute
    match.endMinute = startMinute + duration
    match.startTimeText = formatMinutes(match.startMinute)
    match.endTimeText = formatMinutes(match.endMinute)
  }

  match.lockedSchedule = true
  saveTournaments(tournaments)
  return tournament
}

function updatePlayerDisplayName(tournamentId, payload) {
  const tournaments = getTournaments()
  const tournament = tournaments.find(t => t.id === tournamentId)
  if (!tournament) return null

  const teamId = payload ? payload.teamId : null
  const playerId = payload ? payload.playerId : null
  const playerNumber = payload ? String(payload.playerNumber || '') : ''
  const newName = payload ? String(payload.newName || '').trim() : ''
  if (!teamId || !newName) return null

  const team = tournament.teams.find(t => t.id === teamId)
  if (team) {
    if (playerId) {
      const p = team.players.find(item => item.id === playerId)
      if (p) p.name = newName
    } else if (playerNumber) {
      const p = team.players.find(item => String(item.number) === playerNumber)
      if (p) p.name = newName
    }
  }

  ;(tournament.matches || []).forEach(match => {
    ;(match.events || []).forEach(event => {
      if (event.teamId !== teamId) return

      const byId = playerId && event.playerId === playerId
      const byNumber = !playerId && playerNumber && String(event.playerNumber || '') === playerNumber
      if (!byId && !byNumber) return

      event.playerName = newName

      if (!event.playerId && team && playerNumber) {
        const p = team.players.find(item => String(item.number) === playerNumber)
        if (p) event.playerId = p.id
      }
    })
  })

  saveTournaments(tournaments)
  return tournament
}

/**
 * 记录比赛事件（进球、红黄牌）
 * @param {string} matchId
 * @param {Object} event - { type: 'goal'|'yellow'|'red', playerId, playerNumber, playerName, teamId, minute }
 */
function addMatchEvent(tournamentId, matchId, event) {
  const tournaments = getTournaments()
  const tournament = tournaments.find(t => t.id === tournamentId)
  if (!tournament) return null

  const match = tournament.matches.find(m => m.id === matchId)
  if (!match) return null

  event.id = generateId()
  match.events.push(event)

  // 如果是进球，更新比分
  if (event.type === 'goal') {
    if (event.teamId === match.homeTeam) {
      match.homeScore = (match.homeScore || 0) + 1
    } else if (event.teamId === match.awayTeam) {
      match.awayScore = (match.awayScore || 0) + 1
    }
  }

  saveTournaments(tournaments)
  return tournament
}

/**
 * 删除比赛事件
 */
function removeMatchEvent(tournamentId, matchId, eventId) {
  const tournaments = getTournaments()
  const tournament = tournaments.find(t => t.id === tournamentId)
  if (!tournament) return null

  const match = tournament.matches.find(m => m.id === matchId)
  if (!match) return null

  const eventIdx = match.events.findIndex(e => e.id === eventId)
  if (eventIdx < 0) return null

  const event = match.events[eventIdx]
  // 如果是进球，还原比分
  if (event.type === 'goal') {
    if (event.teamId === match.homeTeam) {
      match.homeScore = Math.max(0, (match.homeScore || 0) - 1)
    } else if (event.teamId === match.awayTeam) {
      match.awayScore = Math.max(0, (match.awayScore || 0) - 1)
    }
  }

  match.events.splice(eventIdx, 1)
  saveTournaments(tournaments)
  return tournament
}

/**
 * 开始比赛
 */
function startMatch(tournamentId, matchId) {
  const tournaments = getTournaments()
  const tournament = tournaments.find(t => t.id === tournamentId)
  if (!tournament) return null

  const match = tournament.matches.find(m => m.id === matchId)
  if (!match) return null

  match.status = 'playing'
  match.homeScore = 0
  match.awayScore = 0
  match.startTime = Date.now()
  match.endTime = null

  saveTournaments(tournaments)
  return tournament
}

/**
 * 结束比赛
 */
function finishMatch(tournamentId, matchId, finishData) {
  const tournaments = getTournaments()
  const tournament = tournaments.find(t => t.id === tournamentId)
  if (!tournament) return null

  const match = tournament.matches.find(m => m.id === matchId)
  if (!match) return null

  const isKnockout = isKnockoutStage(match.stage)
  const drawInRegularTime = match.homeScore === match.awayScore

  if (isKnockout && drawInRegularTime) {
    const homeShots = finishData && Array.isArray(finishData.penaltyHomeShots)
      ? finishData.penaltyHomeShots.map(Boolean)
      : null
    const awayShots = finishData && Array.isArray(finishData.penaltyAwayShots)
      ? finishData.penaltyAwayShots.map(Boolean)
      : null

    const homePenalty = homeShots ? homeShots.filter(Boolean).length : (finishData ? Number(finishData.penaltyHomeScore) : NaN)
    const awayPenalty = awayShots ? awayShots.filter(Boolean).length : (finishData ? Number(finishData.penaltyAwayScore) : NaN)
    const validPenalty = Number.isFinite(homePenalty) && Number.isFinite(awayPenalty) && homePenalty >= 0 && awayPenalty >= 0
    if (!validPenalty || homePenalty === awayPenalty) {
      return null
    }
    match.penaltyHomeScore = homePenalty
    match.penaltyAwayScore = awayPenalty
    match.penaltyHomeShots = homeShots || []
    match.penaltyAwayShots = awayShots || []
    match.penaltyRule = finishData.penaltyRule || '3+1+1+1'
    match.penaltyNote = finishData.penaltyNote || ''
  }

  match.status = 'finished'
  match.endTime = Date.now()

  // 检查阶段变化
  if (match.stage === 'group' && isGroupStageComplete(tournament)) {
    generateKnockoutMatches(tournament)
  } else if (match.stage === 'semi') {
    const semiMatches = tournament.matches.filter(m => m.stage === 'semi')
    if (semiMatches.every(m => m.status === 'finished')) {
      generateFinalMatches(tournament)
    }
  } else if (match.stage === 'place5semi') {
    const place5SemiMatches = tournament.matches.filter(m => m.stage === 'place5semi')
    if (place5SemiMatches.every(m => m.status === 'finished')) {
      generateLowerPlacementMatchesForEight(tournament)
    }
  }

  if (areAllPlacementMatchesFinished(tournament)) {
    tournament.stage = 'finished'
  }

  saveTournaments(tournaments)
  return tournament
}

/**
 * 获取射手榜
 */
function getTopScorers(tournament) {
  const scorers = {}

  tournament.matches
    .filter(m => m.status === 'finished' || m.status === 'playing')
    .forEach(match => {
      match.events
        .filter(e => e.type === 'goal')
        .forEach(event => {
          const team = tournament.teams.find(t => t.id === event.teamId)
          const player = team && event.playerId ? team.players.find(p => p.id === event.playerId) : null
          const number = player ? player.number : (event.playerNumber || '')
          const key = event.playerId || `${event.teamId}#${number || 'unknown'}`

          if (!scorers[key]) {
            scorers[key] = {
              playerId: event.playerId || null,
              playerName: player ? player.name : (event.playerName || '未登记球员'),
              playerNumber: number,
              teamId: event.teamId,
              teamName: team ? team.name : '未知',
              goals: 0
            }
          }
          scorers[key].goals++
        })
    })

  return Object.values(scorers).sort((a, b) => b.goals - a.goals)
}

/**
 * 获取纪律统计（红黄牌）
 */
function getDisciplineStats(tournament) {
  const stats = {}

  tournament.matches
    .filter(m => m.status === 'finished' || m.status === 'playing')
    .forEach(match => {
      match.events
        .filter(e => e.type === 'yellow' || e.type === 'red')
        .forEach(event => {
          const team = tournament.teams.find(t => t.id === event.teamId)
          const player = team && event.playerId ? team.players.find(p => p.id === event.playerId) : null
          const number = player ? player.number : (event.playerNumber || '')
          const key = event.playerId || `${event.teamId}#${number || 'unknown'}`

          if (!stats[key]) {
            stats[key] = {
              playerId: event.playerId || null,
              playerName: player ? player.name : (event.playerName || '未登记球员'),
              playerNumber: number,
              teamId: event.teamId,
              teamName: team ? team.name : '未知',
              yellowCards: 0,
              redCards: 0
            }
          }
          if (event.type === 'yellow') {
            stats[key].yellowCards++
          } else {
            stats[key].redCards++
          }
        })
    })

  return Object.values(stats).sort((a, b) => {
    if (b.redCards !== a.redCards) return b.redCards - a.redCards
    return b.yellowCards - a.yellowCards
  })
}

/**
 * 获取队伍名称
 */
function getTeamName(tournament, teamId) {
  const team = tournament.teams.find(t => t.id === teamId)
  return team ? team.name : '未知'
}

module.exports = {
  generateId,
  getTournaments,
  getCurrentTournament,
  saveTournament,
  saveTournaments,
  setCurrentTournament,
  createTournament,
  calculateGroupStandings,
  isGroupStageComplete,
  generateKnockoutMatches,
  generateFinalMatches,
  addMatchEvent,
  removeMatchEvent,
  startMatch,
  finishMatch,
  updateMatchSchedule,
  updatePlayerDisplayName,
  getTopScorers,
  getDisciplineStats,
  getTeamName
}
