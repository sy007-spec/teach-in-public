# 课程内容 API 与应用授权

实现入口：管理后台 → 智能与集成 → 课程 API 授权。部署启用前配置私有运行目录中的 content-identity.json，字段 issuer、clientId，以及供应商需要时的 clientSecret；不得写入Git。IdP回调为课堂同源 /api/content-access/callback。

管理员先创建应用，仅一次返回应用Key。随后从管理会话发起统一账户登录，校验授权码+PKCE、state、nonce、签名、issuer、audience、azp、auth_time及amr；最近十分钟可信MFA才可在页面明确批准。首次批准绑定本地管理身份与统一issuer/subject，后续不能换成另一统一账户。回调本身不批准应用。有效管理员会话和绑定仍在线检查；本地管理身份会话全部失效后接入会停止，需管理员重新登录，不能把30天授予期限理解为绕过本地权限撤销。

作用域当前只有content:read，逐项选择courseId/businessVersion。授权1至720小时；Key只向同源 /api/content-access/token交换最长十分钟访问令牌，不直接读内容。访问令牌绑定resource、应用、scope、资源和授权版本；撤销立即拒绝旧令牌。连接撤销与已发布成果使用权分离。

持续成果授权明确retain、compile、persistentDisplay、audience和服务端生成receiptId。批准者须有权开放这些课程。读取只含已发布修订和去除speaker的教材，不包含讨论、私人笔记及讲师备注。

接口：/api/content-access/metadata、token、apps、start、callback、approve、revoke；内容目录 /api/content/v1/catalog；精确修订 /api/content/v1/revision?course=ID&version=VERSION&revision=REVISION。目录返回当前发布清单和etag；实例UUID在本机配置中持久保存，不随域名变化重新生成。

当前同步协议为完整获准目录+etag核对，尚无增量游标和主动撤回事件；消费方必须定期核对，不得声称已达到事件实时同步。正文接口复核当前修订，源更新返回409。必要附件资源接口尚待独立实现，不以临时外链承诺独立成果。

验证：application-access.test.mjs、content-access.test.mjs覆盖MFA、授权范围、令牌/Key区分、撤销、版本和讲师信息排除；content-access-browser.cjs覆盖登录、创建/撤销、身份配置缺失及桌面/窄屏。测试数据虚构。生产MFA、实际课程接入及部署需另行验收。
