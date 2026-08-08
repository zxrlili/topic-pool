import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { listOpen, getTopic, setStatus } from "../pool.js";

function createMcpServer() {
  const server = new McpServer({ name: "topic-pool", version: "0.1.0" });

  server.tool("topic_list", "查看话题池里所有未过期、未处理的 Topic",
    { category: z.string().optional() },
    async ({ category }) => {
      const topics = await listOpen(category);
      if (!topics.length) return { content: [{ type: "text", text: "池子是空的——这轮外面没捞到值得追的，或者都过期了。" }] };
      const text = topics.map((t) => `# ${t.hook}\n源: ${t.source_title} · ${t.source_url}\n分类: ${t.category} · 过期: ${t.expires_at}\nid: ${t.id}`).join("\n\n");
      return { content: [{ type: "text", text }] };
    }
  );

  server.tool("topic_get", "按 id 看某条 Topic 详情",
    { topic_id: z.string() },
    async ({ topic_id }) => {
      const t = await getTopic(topic_id);
      if (!t) return { content: [{ type: "text", text: "没找到这条 Topic（id 可能过期或被清理）。" }] };
      return { content: [{ type: "text", text: JSON.stringify(t, null, 2) }] };
    }
  );

  server.tool("topic_follow", "把某条 Topic 标记为已带走聊过（consumed）",
    { topic_id: z.string() },
    async ({ topic_id }) => {
      return { content: [{ type: "text", text: await setStatus(topic_id, "consumed") ? "已标记 consumed。" : "未找到。" }] };
    }
  );

  server.tool("topic_ignore", "把某条 Topic 丢掉（dead）",
    { topic_id: z.string() },
    async ({ topic_id }) => {
      return { content: [{ type: "text", text: await setStatus(topic_id, "dead") ? "已丢掉。" : "未找到。" }] };
    }
  );

  return server;
}

const app = express();
const transports = new Map();

async function handleMcpRequest(req, res) {
  const sessionId = req.headers["mcp-session-id"];
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    if (sessionId) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    const id = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      onsessioninitialized: (t) => {
        transports.set(id, t);
        t.onclose = () => transports.delete(id);
      }
    });
    const server = createMcpServer();
    await server.connect(transport);
  }
  await transport.handleRequest(req, res);
}

app.get("/mcp", handleMcpRequest);
app.post("/mcp", handleMcpRequest);

const PORT = process.env.PORT || 8085;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`topic-pool MCP listening on http://0.0.0.0:${PORT}/mcp`);
});
