# TeachInPublic

Open-source online PPT, with course access under your control.

MIT-licensed, self-hosted software for bilingual teaching, course access approval, discussions, notes and time-limited reading links. Optional [managed hosting](https://training.seii.top/) is a separate service; self-hosted installations have no hosting subscription requirement. Dependencies retain their own licenses.

## Start

Node.js 24 is required.

    npm ci
    npm start

The default listener is http://127.0.0.1:3140. Open /admin to sign in. On first startup, initial administrator credentials are written to runtime/admin-access.txt; keep this file private. Runtime data is excluded from Git.

A new installation contains no courses or teaching materials. Create a course in the administrator console, choose its access code, upload Chinese and English Markdown files, review the draft, then publish explicitly. Uploading never publishes automatically. Course codes select a course; they do not bypass identity verification or access approval.

## Materials and teaching

Materials belong to the deployment operator and are uploaded after installation. This repository contains no customer curriculum, internal document paths or product teaching content. See [Markdown format](MARKDOWN_FORMAT.md) for the upload contract and [user guide](USER_GUIDE.md) for classroom workflows.

Chinese and English pages use matching stable IDs. Business versions and content revisions are independent. Replacing a draft, publishing a revision or reorganizing pages preserves prior learning records. Notes, questions and annotations remain associated with their original pages.

The classroom includes a resizable presentation workspace, independent browser tabs, full-window Mermaid diagrams and a mobile layout. External sites may disallow embedding; open them in a separate window in that case.

## Access and collaboration

Administrators configure course permissions, instructors, user security resets, sharing permissions and publication. Learners can discuss, annotate, attach compressed images and keep private notes. Visibility rules apply to replies, attachments, exports and pinned discussions.

Shared reading links have bounded lifetimes and administrator approval controls. Reading analytics are engagement indicators, not proof of learning. Optional Lark integration and scoped agent APIs require configuration and authorization.

The optional Feishu/Lark **classroom assistant** (课堂助手) turns a group chat into a classroom: discussions are cleaned, anonymised, kept within the course key description and saved daily as course sources, and the course draft is refreshed from them; nothing is published automatically. It is a paid add-on of the managed hosting service, which injects its private Feishu/Lark module (`createApp({larkAssist})`); self-hosted installations keep the free statistics and approval cards. See [LARK_CLASSROOM_SPEC.md](LARK_CLASSROOM_SPEC.md).

Every course has a **key description** (课程关键说明): what it covers, for whom and what it excludes. It is shown to learners as the course introduction, keeps AI drafts within scope, and is refreshed by AI whenever a revision is uploaded (on by default; authors can edit it any time). See [COURSE_BRIEF_SPEC.md](COURSE_BRIEF_SPEC.md).

## Deployment and verification

Set PUBLIC_URL to your HTTPS origin, RUNTIME_DIR to a private persistent directory, and PORT/HOST as needed. See [deployment](ops/README.md) for proxy, backup and container setup.

    npm test
    npm run check

Browser tests require Playwright and an installed browser. Set PLAYWRIGHT_MODULE and CHROME_PATH if needed. Tests generate synthetic placeholder records; they do not use customer materials or production data.

Never commit credentials, runtime databases, uploads, private documents or browser session files. Back up runtime data before upgrades and verify restoration separately.

## AI-assisted draft creation

In Course management → New course, optionally configure an OpenAI-compatible model connection, upload one TXT/MD/CSV/text-PDF/DOCX file, generate and review both language files, then create the course with its ID, bilingual name and access code. Downloads are valid paired Markdown files under [the format contract](MARKDOWN_FORMAT.md). Creation saves an unpublished draft; publication remains an explicit separate action. The source is sent only to the selected model. Scanned PDFs require OCR first; source images are not imported. Limit: 8 MB source, 150,000 extracted characters, 200 PDF pages and 32 MB expanded DOCX.

Model credentials are write-only in admin responses and remain in private runtime settings. Changing a provider endpoint requires its key. HTTPS is required; hosted custom endpoints must be on the server allowlist (`TRAINING_LLM_ALLOWED_HOSTS`, in addition to common compatible providers). A compatible CoworkerLLM endpoint can expose additional native providers.

Hosting injects a current subscription policy into the core; self-hosted installations have no hosting plan quotas. New courses and all existing note/question image writes consume shared monthly space limits transactionally. Existing contents remain readable after limits are reached. Image quotas count newly uploaded images, not retained image references; deletion does not refund usage. Global model usage reserves an upper bound before dispatch, settles reported input/output tokens and retains unknown usage conservatively. Own-key requests do not consume platform model tokens. Month boundaries use Asia/Shanghai.

### 讲师版本管理授权
管理员可按课程勾选“业务版本与修订管理”，允许指定讲师上传/替换草稿、下载源文件、发布或撤下修订、设置默认业务版本、调整可见范围、删除非当前修订。此授权独立于备课和发布权限，默认关闭；撤销和到期立即生效。操作保留讲师审计身份，不授予课程创建、用户管理、跨课程访问资格继承或托管运营权限。


PPT reading links created with the first-open policy start a separate duration window on each recipient's first authorized material read, not at link creation or approval. Refreshes, status polling, denied access and analytics events do not start or reset a window. Approved recipients share the same window across approved browsers with the same email; preapproved anonymous links use browser identity. Requiring individual approval is recommended when recipient-level enforcement matters. Existing fixed-deadline links preserve their promised deadlines. Revocation and publication restrictions still apply.

Hosted content storage is 100 MB (Basic) / 500 MB (Advanced); sources, parsed copies, revisions, images, discussions and restore archives count. Private notes and private discussions are excluded from merchant cloud backups and restore. The hosting platform alone orchestrates OAuth, schedules and administrator-only restore approval; the core exports an allowlisted teaching snapshot and applies nonpublishing, transactional imports.


### 外部身份与课程选择

独立部署使用邮箱账户登录，不内置供应商扫码登录。托管服务可安装可信服务端身份适配器；配置协议见 [EXTERNAL_IDENTITY_SPEC.md](EXTERNAL_IDENTITY_SPEC.md)。供应商应用、授权回调和绑定实现由托管库维护。

外部验证通过后，课程口令、阅读同意、IP及访问审批仍独立生效。首次访客输入课程口令；返回用户可选择已关联课程，优先最后学习课程，有权限时五秒后进入。取消、切换选项、关闭或切到后台停止倒计时。绑定浏览器/IP的许可不会转移到新设备。

个人设置按适配器描述显示身份状态与绑定操作。未安装适配器时不显示外部身份入口。原统计卡片和卡片审批继续独立配置。

### AI 课程答疑

提问会自动使用当前已发布课程资料生成回答，显示引用篇章；学习者可以继续追问。优先使用课堂已配置的自有模型，未配置时使用套餐允许的平台模型。无模型、超时或资料不足会明确显示，问题始终保留。教材更新后旧答案需重新生成；AI回答不替代讲师审核。纯图片问题请补充文字描述。详细边界见 [AI_TUTOR_SPEC.md](AI_TUTOR_SPEC.md)。

课程知识库：筹建中的原始资料须审核批准后才能用于学员答疑。采用本地多语言向量+关键词检索，答案附可核对原文，依据不足拒答。详见 [课程知识库规格](COURSE_KNOWLEDGE_SPEC.md)。首次使用需下载固定版多语言向量模型，缓存位置通过 TRAINING_MODEL_CACHE 指定。


### Gemini 轮询与一次生成双语答复

管理员在“Gemini密钥池”配置 Google 项目组、名称和 API Key，默认模型 gemini-flash-latest。启用后原有课程问答入口优先使用此池；无需建立另一套课程问答或知识库。问题与答案继续按原讨论可见范围保存，检索沿用正式教材及获批知识库，排除讲师备注、未获批资料和其他课程。

一次生成中文和英文答案，再对两种语言共同执行依据审核；不会为了切换语言重新生成。答案内中文/English按钮及页面语言切换均复用已保存答案。教材或知识来源更新仍使旧答案失效，失败时保留问题供重试。

每个 Key 指定项目组，同一 Google 项目的 Key 必须归同组。轮询跳过冷却组；密钥无效、计费（含402）或权限错误触发默认24小时冷却（1–168小时可配）；408/429、5xx、超时、网络异常或无效JSON只退避5分钟，Retry-After 最多延长到1小时；调用方取消不触发冷却。单次调用45秒超时。管理员可在大模型配置卡片“清除冷却并立即重试”。到期后下一请求重新尝试，每个请求最多尝试两个项目组、单次最多25秒，并受整个答疑45秒期限约束；管理页显示冷却结束时间。本连接池不进行后台探测或飞书通知。Google 限额按项目而非 Key 计算，多个 Key 不增加同项目额度。

密钥采用 AES-256-GCM 加密后存入数据库；解密密钥为运行目录 course-ai.key，仅运行账户可读写。务必将运行数据库与该文件作为私有备份一起恢复，不提交到 Git。接口只返回配置状态，不回传 Key。本地知识向量模型需要持久缓存；默认容器内存上限为1GB，初次构建索引需要下载模型。

参考：[Google latest 别名说明](https://developers.googleblog.com/continuing-to-bring-you-our-latest-models-with-an-improved-gemini-2-5-flash-and-flash-lite-release/)、[项目级限额](https://ai.google.dev/gemini-api/docs/rate-limits)。

### Diagnostic log retention
Application audit, raw visits/reading events and model diagnostics are removed after seven days (startup and once per minute). Course content, identities, approvals, discussions and notes are business records and are retained. Historical raw analytics beyond seven days will no longer be available. Model diagnostics show HTTP/provider status, structured quota violations/retry delay and reported token usage, never keys, prompts or answers. Remaining project quota is unknown unless provided by the provider; check Google AI Studio, not a guessed token balance. Operators must also configure seven-day retention for proxy/container logs and their log archives; database recovery snapshots are separate protected backups.

Before every release: fetch the remote main branch, integrate it on main, test, push main, verify the deployed SHA equals remote main, then deploy with backup and rollback.

Standalone process output is stored under runtime/logs in seven UTC daily files, capped at 2 MiB per day. Docker logging is disabled to prevent an unbounded duplicate. Direct API consumers/hosting wrappers must apply their own seven-day process-log policy.

### Saved AI connections
The administrator **AI model connections** page manages course Q&A connections: multiple OpenAI-compatible providers (OpenAI, DeepSeek, Qwen and compatible gateways) or Google Gemini key pools. Saving a new connection leaves it disabled. Enable and use is explicit; disabling retains credentials. Disable before editing; blank keys preserve saved keys, replacement requires confirmation, and stale edits return 409. Hosted custom endpoints must be on the platform allowlist. New keys are encrypted in the site runtime; legacy settings and encryption keys are not rewritten by upgrades. Active self-owned connection failures never silently fall back to the platform. With none selected, hosted Q&A uses its subscription-permitted platform model; standalone Q&A reports unavailable. Existing installations retain their previously effective configuration until explicitly changed. Material conversion and translation retain their existing separate settings.

Course Q&A accepts up to 12 exact source citations, attaches exact original excerpts on the server for every citation and separately verifies factual grounding against those excerpts. Model-generated quote strings are never used as evidence. One bounded regeneration repairs JSON/citation contract failures; it never bypasses grounding. Generation and repair have 4096 output tokens and share a 90-second deadline with verification. Seven-day diagnostics identify generation, format repair and verification failures without storing question/source/answer text.

Knowledge-source diagnostics include published revision and retrieved-source count. Model refusal, no retrieved sources and grounding rejection are distinct outcomes; grounding rejection is shown as an unverified answer, never as proof that the course is missing content. Existing published course indexing and revision invalidation remain unchanged.

### 群内答疑与留言审核

启用课堂助手并关联课程后，在飞书/Lark 群中 @机器人即可根据已发布课程及获准资料答疑。每 5 条问答或首条等待 10 分钟后，私聊卡片通知本群群主及登记管理员；卡片支持查看完整问答、逐条/整批补充到课程留言区、忽略和刷新。群主可 @机器人发送“问答审核”立即汇总。未经确认不会公开到课堂；无 AI 时可只补充待答问题。后台显示处理中、待审核、已补充数量。详见 [群问答实现规格](LARK_GROUP_QA_SPEC.md)。独立部署需由集成启动器注入同一助手模块，并配置本校自己的飞书应用。
