// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  let isAdmin = false

  try {
    const adminResult = await db.collection('admins').doc(wxContext.OPENID).get()
    isAdmin = !!(adminResult.data && adminResult.data.enabled !== false)
  } catch (error) {
    // 未配置管理员或当前用户不在管理员名单时，默认只读。
    isAdmin = false
  }

  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    isAdmin,
    role: isAdmin ? 'admin' : 'viewer'
  }
}
