const tournament = require('./tournament')

function encodeQuery(params) {
  return Object.keys(params || {})
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&')
}

function buildPath(pagePath, params) {
  const query = encodeQuery(params)
  return query ? `${pagePath}?${query}` : pagePath
}

function enableShareMenu() {
  if (typeof wx.showShareMenu !== 'function') return

  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  })
}

function applySharedTournament(options) {
  const tournamentId = options && options.tournamentId
  if (!tournamentId) return false

  const exists = tournament.getTournaments()
    .some(item => String(item.id) === String(tournamentId))

  if (!exists) return false
  tournament.setCurrentTournament(tournamentId)
  return true
}

function getTitle(currentTournament, section) {
  const name = currentTournament && currentTournament.name
    ? currentTournament.name
    : '足球赛事'
  return section ? `${name}｜${section}` : `${name}｜实时赛况`
}

function buildAppMessage(currentTournament, options = {}) {
  const tournamentId = currentTournament ? currentTournament.id : ''
  return {
    title: options.title || getTitle(currentTournament, options.section),
    path: buildPath(options.pagePath || '/pages/index/index', {
      tournamentId,
      ...(options.extraQuery || {})
    })
  }
}

function buildTimeline(currentTournament, options = {}) {
  const tournamentId = currentTournament ? currentTournament.id : ''
  return {
    title: options.title || getTitle(currentTournament, options.section),
    query: encodeQuery({
      tournamentId,
      ...(options.extraQuery || {})
    })
  }
}

function showTimelineGuide() {
  wx.showModal({
    title: '分享到朋友圈',
    content: '点击页面右上角“…”菜单，再选择“分享到朋友圈”。',
    showCancel: false,
    confirmText: '知道了'
  })
}

module.exports = {
  enableShareMenu,
  applySharedTournament,
  buildAppMessage,
  buildTimeline,
  showTimelineGuide
}
