startup-begin = Zotero OpenReview 正在加载...
startup-finish = Zotero OpenReview 已就绪
menuitem-import-openreview = 从 OpenReview 导入...
prefs-title = OpenReview
prefs-table-title = 标题
prefs-table-detail = 详情

# 导入对话框
dialog-title = 从 OpenReview 导入
dialog-url-label = Workshop/Venue URL:
dialog-collection-label = 分类名称:
dialog-filter-label = 论文筛选
dialog-filter-all = 所有论文
dialog-filter-all-accepted = 所有已接收分类
dialog-filter-oral = 仅 Oral
dialog-filter-poster = 仅 Poster
dialog-options-label = 选项
dialog-download-pdfs = 下载 PDF
dialog-import-reviews = 导入评审意见和评论为笔记
dialog-accepted-only = 仅导入已接收论文
dialog-skip-duplicates = 跳过已存在的论文
dialog-import-button = 导入
dialog-cancel-button = 取消

# 进度消息
progress-title = 正在从 OpenReview 导入
progress-parsing-url = 正在解析 URL...
progress-close-blocked = 导入仍在进行中。请保持此窗口打开以保留可视化进度，或先暂停导入。
progress-close-button = 关闭
progress-current-paper = 当前条目：{ $title }
progress-detail-pending = 正在等待下一步导入任务...
progress-found-papers = 共发现 { $count } 篇待处理论文。
progress-keep-visible = 导入正在进行中。为避免丢失导入过程的可视化信息，此窗口会保持打开直到本次导入结束。
progress-fetching-papers = 正在从 OpenReview 获取论文...
progress-importing-current = 正在导入论文（{ $current }/{ $total }）
progress-no-papers = 未找到论文
progress-pause-button = 暂停
progress-pause-requested = 已请求暂停。当前步骤完成后，导入将暂停。
progress-paused = 导入已暂停。点击“继续”以恢复，或关闭此窗口以结束当前导入。
progress-creating-collection = 正在创建分类...
progress-importing = 正在导入论文
progress-ready-to-close = 导入已结束，现在可以关闭此窗口。
progress-resume-button = 继续
progress-complete = 导入完成！已导入: { $imported }, 已跳过: { $skipped }, 失败: { $failed }
progress-error = 错误
progress-summary = 已处理：{ $processed }/{ $total } | 已导入：{ $imported } | 已跳过：{ $skipped } | 失败：{ $failed }

# 错误消息
error-title = OpenReview 导入错误
error-no-url = 请输入 OpenReview URL
error-no-collection-name = 请输入分类名称
error-invalid-url = 无效的 OpenReview URL。请输入有效的 venue 或 workshop URL。