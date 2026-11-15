# 课程一键分享

课堂顶部工具栏、浮动栏与阅读页共用一个分享组件、卡片和 `/api/shares` 接口。旧弹窗及独立创建逻辑已移除；升级前已打开页面的旧接口路径仅映射到同一个统一服务，继续执行相同权限及一次性规则。拥有课程分享权限的人可设置阅读及课堂授权时长，生成课程卡片、二维码及链接，复制链接、复制 PNG 图片、保存图片或调用设备分享。图片剪贴板不可用时明确提示保存图片，不声称复制成功。时长均为整数小时，受课程上限控制（默认24，最多168）。卡片采用 EduSquare 参考页面的暖色封面、圆角卡片和紫色重点色。

## 一次性邀请与角色

- 所有新邀请只允许成功授权一位接收者，服务端事务原子消费；预览、打开卡片、提交待审批申请不会消费。课堂授权成功或PPT申请获批即消费，另一种方式也不能再兑换。已授权者在期限内继续使用。
- 已使用链接的卡片及新接收者访问返回失效；已领取者的重复请求不重置期限、不恢复撤销。管理员调整已发放权限不重新开放邀请。历史已发放阅读记录保留，不再提供独立旧分享创建方式。
- 管理员可选择讲师邀请；普通讲师和学员仅在课程默认或邮箱分享授权允许时分享，不能邀请讲师。前端按服务端能力显示顶部和浮动入口，接口重新验证身份、课程读取资格及分享权限。
- 讲师邀请仅通过课堂账户验证领取，授予当前课程批注、草稿、讨论管理和聚合统计能力，不授予发布、版本管理、权限管理或全站管理员。期限使用课堂授权时长。已有有效讲师授权保持原配置；停用、过期账号或已过期授权需管理员处理，不借邀请复活。课程授权在既有讲师管理入口撤销。

## 接收者流程

1. 打开 `/share#share=…`，显示课程名称、自动填入的课程口令和两种阅读方式。这个步骤不启动 PPT 计时。
2. PPT：免登录，首次只返回第一页，点击下一页显示申请；提交并获管理员批准后才能继续。待审批者不能通过接口或页面定位获取后续页。阅读时长从首次获批读取开始计时，预览与等待审批不消耗时长，刷新不重置。
3. 课堂：进入同一课程的既有账户登记页，口令自动填入。登记姓名、邮箱及学习数据同意，完成现有安全问题/密码验证后获得正式课程授权。邮箱登记本身不表示验证邮箱所有权，不绕过已有账户验证。
4. 正式授权写入现有访问申请表，沿用设备/IP范围及管理员撤销入口。课堂期限从首次授权起算，与 PPT 期限独立。已有申请或授权保持原状态和期限；已撤销、拒绝或过期的授权不能通过重复打开或另一条分享重新取得。

## 权限与兼容

- 统一分享支持PPT阅读或课堂登记；讲师邀请只展示课堂领取。PPT第一页直接阅读、后续逐人审批。整条预批准功能已删除。
- 分享者仍须通过现有身份、课程访问及分享权限检查。默认新课程不允许普通用户分享。允许课程分享也意味着可分发有时长上限的课堂邀请。
- 有效签名链接才能取得课程口令和公开介绍；无签名、伪造签名、撤销分享、停用课程、删除/私有化修订均拒绝访问。
- 课程口令只用于选择课程；未完成账户验证者不能兑换课堂授权。兑换时校验当前课程，不允许跨课程使用。
- 撤销分享停止新的匿名读取及课堂登记；已发放的课堂授权由现有访问管理单独撤销，不随分享撤销追溯删除。
- 分享卡片及选择页不返回教材正文。PPT 仅提供正文、目标、自测，排除私人笔记、讨论、讲师稿和后台数据。
- API 响应不缓存；签名位于 URL fragment，不放入路径或查询串。卡片下载和测试截图不进入源码库。

## 验证

`npm test` 覆盖新增邀请的权限、签名、课程隔离、未验证账户拒绝、一次性授权、过期与撤销及历史分享兼容。`tests/share-entry-browser.cjs` 验证真实浏览器中的卡片下载、桌面/手机入口、自动填入口令、账户验证到正式课堂的流程、PPT 刷新期限及两种期限独立。


### 课堂名称与徽标 / Classroom branding

管理员在“内容 → 课堂设置”修改名称并上传浅色、深色徽标（PNG/JPEG/WebP，最大 2 MB）。徽标保存在本站，显示于课堂顶部、分享卡片与接收页；导出图片使用当前主题徽标。托管课堂名称由托管平台管理。已导出图片不自动更新。

Administrators can configure names and light/dark logos under Content → Classroom settings. Logos are stored locally and included in headers, share cards, landing pages and exported images. Hosted names remain managed by the hosting platform. Previously exported images do not update automatically.

课堂授权支持 1–5000 整数小时；PPT 时长仍按课程上限单独控制。Classroom authorization supports 1–5000 whole hours; PPT reading retains its separate course limit.

## Compact share preview (2026-11-15)

The generated share result uses a wide, compact preview with course content on the left and QR/scan instructions on the right. The preview adapts to available dialog height; ordinary laptop viewports show the complete card, URL and action buttons together. Narrow screens retain a readable QR and two-column actions. Exceptionally long content can scroll inside the preview without pushing actions below the window. PNG export remains full resolution and is independent from preview dimensions.

Browser acceptance covers 1366×768, 1280×720, 1024×600 and 390×844: all preview imagery and copy/save actions remain in the viewport, ordinary fixture content has no internal clipping, and no page horizontal overflow. Copy-image, PNG download, classroom/instructor invitations and revocation continue to pass.

## Invitation language switching (2026-11-15)

The course invitation landing page exposes a visible English/中文 control in the upper right, including loading, instructor invitations and unavailable-link states. Switching updates the page, document language/title and stored language preference without a reload or another share-entry request. The bearer invitation remains unchanged; PPT/classroom destination fragments carry the selected language without altering their access tokens. Browser checks cover both directions, same-document navigation, unchanged invitation token, no extra entry fetch or read-window creation, instructor-only access and bilingual revoked-state messages.
