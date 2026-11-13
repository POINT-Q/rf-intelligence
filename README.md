# RF Intelligence｜射频与专业通信情报中心

基于 Cloudflare Workers + Static Assets + D1 + Cron + DeepSeek API 的起步项目。

## 当前包含
- 响应式中文网站首页（电脑/手机）
- `/api/news` 情报列表 API、分类筛选
- D1 新闻数据表
- 每日北京时间 08:30 定时任务（Cron 使用 UTC：`30 0 * * *`）
- RSS 采集与 DeepSeek 中文摘要/技术解读/行业影响分析
- URL 唯一约束，避免重复收录

## 1. 本地准备
需要 Node.js（建议 LTS）和 npm。

```bash
npm install
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填入 DeepSeek API Key。不要把真实 Key 提交到 GitHub。

## 2. 创建 Cloudflare D1 数据库
```bash
npx wrangler login
npx wrangler d1 create rf-intelligence-db
```
把命令输出的 `database_id` 填入 `wrangler.toml`，替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。

初始化本地数据库：
```bash
npm run db:init
```

## 3. 本地运行
```bash
npm run dev
```
打开 Wrangler 输出的本地地址。首次本地运行前，请确认 D1 本地数据库已初始化。

## 4. 设置线上密钥并初始化线上数据库
```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DEEPSEEK_MODEL
npm run db:init:remote
```
`DEEPSEEK_MODEL` 可填 `deepseek-chat`。如果不设置，代码默认使用 `deepseek-chat`。

## 5. 部署
```bash
npm run deploy
```
部署后 Cloudflare 会分配 `*.workers.dev` 地址。后续可在 Cloudflare 绑定自己的域名。

## 6. GitHub
在项目目录执行：
```bash
git init
git add .
git commit -m "Initial RF Intelligence starter"
```
然后在 GitHub 创建空仓库，按 GitHub 页面提示添加 remote 并 push。

## 重要说明
- 这是可扩展的第一版骨架，不是已经部署上线的网站。
- 当前使用 Google News RSS 搜索源做采集验证；正式使用前应逐步替换/补充厂商官网、标准组织、监管机构、专业媒体等一手来源。
- RSS 的发布时间和描述质量不一，页面保留原文链接；重要信息应回到原始来源核验。
- 当前定时任务按 RSS 每源最多取 12 条，再进行去重和 AI 分析。后续可增加每日精选、重要性评分、厂商/技术标签、历史搜索和管理后台。
- DeepSeek API 按实际调用量计费，费用由 DeepSeek 账户/API 定价决定；ChatGPT 订阅不包含 DeepSeek API 额度。
