import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) { console.error("缺少 DEEPSEEK_API_KEY——复制 .env.example 为 .env 并填上你的 key"); process.exit(1); }

const SYSTEM = `你是话题池的筛选器。规则：
1. Topic 是材料，不是任务——只挑"值得继续追一下"的候选。
2. 必须基于真实来源，禁止编造来源。
3. hook = 材料事实 + 一个值得继续追的点（一句话）。
4. 不要问号选题、震惊体、营销标题。
5. 相似内容去重。
6. 没有好内容就返回空数组。
7. 每轮最多 1~3 条。
8. 输出严格 JSON：{"topics":[{"hook":"...","source_title":"...","source_url":"...","category":"...","ttl_hours":24}]}`;

async function main() {
  let candidates = [];
  try { candidates = JSON.parse(await readFile(join(DATA_DIR, "candidates.json"), "utf8")); } catch {}
  if (!candidates.length) { console.log("filter: 无候选，跳过"); return; }
  const brief = candidates.map((c) => `- [${c.category}] ${c.title}\n  ${c.url}\n  ${(c.summary || "").slice(0, 200)}`).join("\n");
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `以下是本轮候选，请筛选 0~3 条值得带回家的 Topic：\n\n${brief}` }
      ]
    })
  });
  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  const topics = (parsed.topics || []).slice(0, 3);
  await writeFile(join(DATA_DIR, "filtered.json"), JSON.stringify(topics, null, 2));
  console.log(`filter: 筛出 ${topics.length} 条 Topic`);
}

main().catch((e) => { console.error(e); process.exit(1); });
