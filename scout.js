import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const OUT = join(DATA_DIR, "candidates.json");

async function fetchHN() {
  try {
    const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
    const ids = (await res.json()).slice(0, 20);
    const items = await Promise.all(
      ids.slice(0, 12).map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          return await r.json();
        } catch { return null; }
      })
    );
    return items
      .filter(Boolean)
      .filter((i) => i.title && i.url)
      .map((i) => ({
        source_id: `hn_${i.id}`,
        title: i.title,
        url: i.url,
        published_at: new Date(i.time * 1000).toISOString(),
        summary: (i.text || "").replace(/<[^>]+>/g, "").slice(0, 300),
        category: "tech"
      }));
  } catch (e) { console.error("HN fetch failed:", e.message); return []; }
}

async function fetchArxiv() {
  try {
    const url = "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.HC&sortBy=submittedDate&sortOrder=descending&max_results=10";
    const res = await fetch(url);
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    return entries.map((e, idx) => {
      const get = (tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
      const id = get("id").trim();
      return {
        source_id: `arxiv_${id.split("/abs/")[1] || idx}`,
        title: get("title").replace(/\s+/g, " ").trim(),
        url: id,
        published_at: get("published"),
        summary: get("summary").replace(/\s+/g, " ").trim().slice(0, 300),
        category: "science"
      };
    }).filter((i) => i.title);
  } catch (e) { console.error("arxiv fetch failed:", e.message); return []; }
}

async function fetchGitHub() {
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const url = `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=10`;
    const res = await fetch(url, { headers: { "User-Agent": "topic-pool-scout", "Accept": "application/vnd.github+json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.items || []).map((i) => ({
      source_id: `gh_${i.id}`,
      title: i.full_name,
      url: i.html_url,
      published_at: i.created_at,
      summary: (i.description || "").slice(0, 300),
      category: "open-source"
    }));
  } catch (e) { console.error("github fetch failed:", e.message); return []; }
}

async function fetchGoogleNews() {
  try {
    const url = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(url);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    return items.slice(0, 10).map((e, idx) => {
      const get = (tag) => (e.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
      const urlMatch = e.match(/<link>([^<]*)<\/link>/);
      return {
        source_id: `gn_${idx}_${Date.now()}`,
        title: get("title"),
        url: urlMatch ? urlMatch[1] : "",
        published_at: get("pubDate"),
        summary: get("description").replace(/<[^>]+>/g, "").slice(0, 300),
        category: "news"
      };
    }).filter((i) => i.title && i.url);
  } catch (e) { console.error("google news fetch failed:", e.message); return []; }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const sources = await Promise.all([fetchHN(), fetchArxiv(), fetchGitHub(), fetchGoogleNews()]);
  const candidates = sources.flat().filter((c) => c.title);
  await writeFile(OUT, JSON.stringify(candidates, null, 2));
  console.log(`scout: 抓到 ${candidates.length} 条候选（HN/arxiv/GitHub/News）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
