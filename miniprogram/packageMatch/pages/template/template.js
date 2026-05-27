const tournament = require('../../../utils/tournament')

Page({
  data: {
    templates: [],
    selectedTemplateId: null,
    selectedTemplate: null,
    previewInfo: null,
    showPreviewModal: false,
    showDeleteConfirm: false,
    deleteTargetId: null,
    showCreateModal: false
  },

  onShow() {
    this.loadTemplates()
  },

  /**
   * 加载模板列表
   */
  loadTemplates() {
    const templates = tournament.getTemplates()
    this.setData({ templates })
  },

  /**
   * 点击选择模板
   */
  selectTemplate(e) {
    const templateId = e.currentTarget.dataset.templateId
    const selectedTemplate = tournament.getTemplate(templateId) || null
    const previewInfo = this.getTemplateInfo(selectedTemplate)
    this.setData({
      selectedTemplateId: templateId,
      selectedTemplate,
      previewInfo,
      showPreviewModal: true
    })
  },

  /**
   * 关闭预览弹窗
   */
  closePreviewModal() {
    this.setData({
      showPreviewModal: false,
      selectedTemplateId: null,
      selectedTemplate: null,
      previewInfo: null
    })
  },

  /**
   * 使用选中的模板创建赛事
   */
  useTemplate() {
    const { selectedTemplateId } = this.data
    if (!selectedTemplateId) return

    // 跳转到创建页面并传递模板ID
    wx.navigateTo({
      url: `/pages/create/create?templateId=${selectedTemplateId}`
    })
  },

  /**
   * 编辑模板
   */
  editTemplate(e) {
    const templateId = e.currentTarget.dataset.templateId
    if (!templateId) return

    wx.navigateTo({
      url: `/pages/template-create/template-create?templateId=${templateId}`
    })
  },

  /**
   * 显示删除确认
   */
  showDeleteConfirm(e) {
    const templateId = e.currentTarget.dataset.templateId
    this.setData({
      showDeleteConfirm: true,
      deleteTargetId: templateId
    })
  },

  /**
   * 关闭删除确认
   */
  closeDeleteConfirm() {
    this.setData({
      showDeleteConfirm: false,
      deleteTargetId: null
    })
  },

  /**
   * 确认删除模板
   */
  confirmDelete() {
    const { deleteTargetId } = this.data
    if (!deleteTargetId) return

    const success = tournament.deleteTemplate(deleteTargetId)
    if (success) {
      wx.showToast({ title: '删除成功', icon: 'success' })
      this.closeDeleteConfirm()
      this.loadTemplates()
    } else {
      wx.showToast({ title: '删除失败', icon: 'error' })
    }
  },

  /**
   * 获取模板预览信息
   */
  getTemplateInfo(template) {
    if (!template) {
      return {
        venues: '--',
        startTime: '--',
        matchDuration: '--',
        breakTime: '--',
        useGroups: '--',
        legs: '--',
        slotsText: '无'
      }
    }

    const venuesCount = Array.isArray(template.venues) && template.venues.length > 0
      ? template.venues.length
      : (template.venueCount || 0)

    const slotCount = Array.isArray(template.matchSlots) ? template.matchSlots.length : 0

    const useGroups = template.templateConfig?.useGroups
      ? `分组制${template.templateConfig?.groupCount ? `（${template.templateConfig.groupCount}组）` : ''}`
      : '单循环'

    return {
      venues: venuesCount || '--',
      startTime: template.scheduleConfig?.startTime || '--',
      matchDuration: template.scheduleConfig?.groupMatchMinutes || '--',
      breakTime: template.scheduleConfig?.breakMinutes || '--',
      useGroups,
      legs: template.templateConfig?.legs || 1,
      slotsText: slotCount > 0 ? `${slotCount}场比赛` : '无'
    }
  },

  /**
   * 获取模板详情
   */
  getTemplate(templateId) {
    return tournament.getTemplate(templateId) || {}
  },

  /**
   * 格式化日期时间
   */
  formatDate(timestamp) {
    if (!timestamp) return '--'
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const mi = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${mi}`
  },

  /**
   * 导出模板（作为备份）
   */
  exportTemplate(e) {
    const templateId = e.currentTarget.dataset.templateId
    const template = tournament.getTemplate(templateId)
    if (!template) return

    wx.setClipboardData({
      data: JSON.stringify(template),
      success() {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      }
    })
  },

  /**
   * 显示创建新模板的帮助
   */
  showCreateHelp() {
    this.setData({ showCreateModal: true })
  },

  closeCreateModal() {
    this.setData({ showCreateModal: false })
  },

  /**
   * 跳转到创建模板页面
   */
  goCreateTemplate() {
    wx.navigateTo({
      url: '/packageMatch/pages/template-create/template-create'
    })
  },

  /**
   * 返回
   */
  goBack() {
    wx.navigateBack()
  }
})
