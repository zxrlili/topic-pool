# topic-pool 话题池

先筛、会过期、可以不理。把「出去搜东西」从主 Agent 身上拆掉，再给它留一个偶尔能勾起好奇心的外部入口。

## 链路

```
30+ 候选 → Scout(抓取) → Filter(DeepSeek 筛选) → 0~3 Topic → Pool(TTL) → 家机主动翻
```

## 装

```bash
cd ~/topic-pool
npm install
cp .env.example .env   # 填 DEEPSEEK_API_KEY
node scout.js          # 抓候选
node filter.js         # 筛选（调 DeepSeek）
node pool.js --import  # 入池
node pool.js --list    # 看池子里有什么
```

## 定时（每 6 小时一轮）

```bash
crontab -e
0 */6 * * * cd ~/topic-pool && node scout.js >> topic-pool.log 2>&1 && node filter.js >> topic-pool.log 2>&1 && node pool.js --import >> topic-pool.log 2>&1
```

## 给家机（MCP 入口）

在 MCP 客户端里配置 stdio 服务：
- command: `node`
- args: `["/home/lighthouse/topic-pool/mcp/server.js"]`
- cwd: `/home/lighthouse/topic-pool`

工具：
- `topic_list` 看池子（可带 category）
- `topic_get` 按 id 看详情
- `topic_follow` 标记已带走聊过（consumed）
- `topic_ignore` 丢掉不想看的（dead）

收到 ≠ 必须处理。家机可以去查、继续聊，也可以直接忽略。

## 规则

- Topic 是材料，不是任务
- 必须基于真实来源
- hook = 材料事实 + 一个值得继续追的点
- 不要问号选题、震惊体、营销标题
- 相似内容去重
- 没有好内容返回空
- 每轮最多 1~3 条
- 禁止编造来源
