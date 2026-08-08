import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const POOL_FILE = join(DATA_DIR, "pool.json");

async function loadPool() {
  try { return JSON.parse(await readFile(POOL_FILE, "utf8")); }
  catch { return { topics: [] }; }
}

async function savePool(pool) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(POOL_FILE, JSON.stringify(pool, null, 2));
}

function norm(s = "") { return s.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, ""); }

export async function addTopics(items) {
  const pool = await loadPool();
  const now = Date.now();
  let added = 0;
  for (const it of items) {
    if (!it.hook) continue;
    const dup = pool.topics.some((t) =>
      (it.source_url && t.source_url === it.source_url) ||
      (t.source_title && it.source_title && norm(t.source_title) === norm(it.source_title))
    );
    if (dup) continue;
    const ttl = it.ttl_hours || 24;
    pool.topics.push({
      id: "topic_" + randomUUID().slice(0, 8),
      hook: it.hook,
      source_title: it.source_title || "",
      source_url: it.source_url || "",
      category: it.category || "other",
      observed_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttl * 3600e3).toISOString(),
      status: "open"
    });
    added++;
  }
  for (const t of pool.topics) {
    if (t.status === "open" && new Date(t.expires_at).getTime() < now) t.status = "expired";
  }
  await savePool(pool);
  return added;
}

export async function listOpen(category) {
  const pool = await loadPool();
  const now = Date.now();
  return pool.topics.filter((t) =>
    t.status === "open" &&
    new Date(t.expires_at).getTime() >= now &&
    (!category || t.category === category)
  );
}

export async function getTopic(id) {
  const pool = await loadPool();
  return pool.topics.find((t) => t.id === id) || null;
}

export async function setStatus(id, status) {
  const pool = await loadPool();
  const t = pool.topics.find((t) => t.id === id);
  if (!t) return false;
  t.status = status;
  await savePool(pool);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv[2];
  const arg = process.argv[3];
  if (flag === "--list") {
    const topics = await listOpen(arg);
    console.log(JSON.stringify(topics, null, 2));
  } else if (flag === "--expire") {
    await addTopics([]);
    console.log("pool: 过期项已清理");
  } else if (flag === "--consume" && arg) {
    console.log(await setStatus(arg, "consumed") ? "已标记 consumed" : "未找到");
  } else if (flag === "--ignore" && arg) {
    console.log(await setStatus(arg, "dead") ? "已标记 dead" : "未找到");
  } else {
    console.log("用法: node pool.js --list [category] | --expire | --consume <id> | --ignore <id>");
  }
}
