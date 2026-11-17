const FEEDS = [
  { name: "RF & Semiconductor", url: "https://news.google.com/rss/search?q=RF+front+end+PA+FEM+filter+antenna&hl=en-US&gl=US&ceid=US:en" },
  { name: "Wireless & 5G/6G", url: "https://news.google.com/rss/search?q=5G-Advanced+6G+NTN+wireless+通信&hl=en-US&gl=US&ceid=US:en" },
  { name: "Professional Communications", url: "https://news.google.com/rss/search?q=PoC+radio+professional+mobile+radio+mission+critical+communications&hl=en-US&gl=US&ceid=US:en" },
  { name: "Emerging RF", url: "https://news.google.com/rss/search?q=UWB+Wi-Fi+HaLow+LoRa+RF+sensing&hl=en-US&gl=US&ceid=US:en" }
];

const CATEGORIES = ["RF前端", "天线技术", "通信技术", "专业通信", "新兴技术", "产业竞争", "行业动态"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "RF Intelligence", time: new Date().toISOString() });
    }

    // 新增：全局统计。总数不再随分类筛选变化，供首页"情报总数"使用。
    if (url.pathname === "/api/stats") {
      const [totalRow, recentRow, analyzedRow] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS c FROM news").first(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM news WHERE fetched_at >= datetime('now', '-1 day')").first(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM news WHERE status = 'analyzed'").first()
      ]);
      return json({
        total: Number(totalRow?.c || 0),
        recent: Number(recentRow?.c || 0),
        analyzed: Number(analyzedRow?.c || 0)
      });
    }

    if (url.pathname === "/api/news") {
      const category = url.searchParams.get("category");
      // 新增 days：只取最近 N 天（按发布时间，缺失时退回抓取时间）。0 或不传表示不限。
      const days = Number(url.searchParams.get("days") || 0);
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
      let sql = "SELECT * FROM news";
      const where = [];
      const binds = [];
      if (category && category !== "全部") {
        where.push("category = ?");
        binds.push(category);
      }
      if (days > 0) {
        where.push("datetime(COALESCE(published_at, fetched_at)) >= datetime('now', ?)");
        binds.push(`-${Math.floor(days)} days`);
      }
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ?";
      binds.push(limit);
      const result = await env.DB.prepare(sql).bind(...binds).all();
      return json({ items: result.results || [] });
    }

    if (url.pathname.startsWith("/api/news/")) {
      const id = Number(url.pathname.split("/").pop());
      const item = await env.DB.prepare("SELECT * FROM news WHERE id = ?").bind(id).first();
      return item ? json(item) : json({ error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(collectAndAnalyze(env));
  }
};

async function collectAndAnalyze(env) {
  for (const feed of FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: { "User-Agent": "RF-Intelligence/0.1 (+daily research digest)" }
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const entries = parseFeed(xml).slice(0, 12);

      for (const entry of entries) {
        if (!entry.title || !entry.link) continue;
        const exists = await env.DB.prepare("SELECT id FROM news WHERE url = ?").bind(entry.link).first();
        if (exists) continue; // 已收录（含 ai_failed）就跳过，避免每次 cron 重复调用 DeepSeek 花钱

        const analysis = await analyzeWithDeepSeek(entry, feed.name, env);
        await env.DB.prepare(`
          INSERT OR IGNORE INTO news
          (source, title, url, published_at, fetched_at, category, summary,
           technical_analysis, industry_impact, importance, ai_model, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          feed.name, entry.title, entry.link, entry.publishedAt || null,
          new Date().toISOString(), analysis.category || "行业动态",
          analysis.summary || entry.description || "",
          analysis.technical_analysis || "",
          analysis.industry_impact || "",
          Math.max(1, Math.min(5, Number(analysis.importance) || 3)),
          env.DEEPSEEK_MODEL || "deepseek-chat",
          analysis.status || "analyzed"
        ).run();
      }
    } catch (err) {
      console.error("Feed failed:", feed.name, String(err));
    }
  }
}

function parseFeed(xml) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return blocks.map(block => {
    const title = clean(getTag(block, "title"));
    const link = getTag(block, "link") || (block.match(/<link[^>]+href=["']([^"']+)/i) || [])[1] || "";
    const publishedAt = getTag(block, "pubDate") || getTag(block, "published") || getTag(block, "updated");
    const description = clean(getTag(block, "description") || getTag(block, "summary") || "");
    return { title, link: decode(link), publishedAt, description };
  });
}
function getTag(s, tag) {
  const m = s.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}
function clean(s) {
  return decode(s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " "));
}
function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function analyzeWithDeepSeek(item, source, env) {
  if (!env.DEEPSEEK_API_KEY) {
    return {
      category: "行业动态",
      summary: item.description || "尚未配置 DeepSeek API Key，暂未生成 AI 摘要。",
      technical_analysis: "配置服务端密钥后，将自动生成技术解读。",
      industry_impact: "待 AI 分析",
      importance: 3,
      status: "ai_pending"
    };
  }

  const prompt = `你是射频与专业通信行业分析师。请基于以下新闻信息做谨慎分析，不要编造未提供的事实。若信息不足，请明确写“待核实”。只返回JSON对象，字段为 category（从RF前端、天线技术、通信技术、专业通信、新兴技术、产业竞争、行业动态中选一个）、summary（中文摘要，80字内）、technical_analysis（技术解读，120字内）、industry_impact（行业影响，100字内）、importance（1-5整数）。
来源：${source}
标题：${item.title}
描述：${item.description}
链接：${item.link}`;

  // 新增：最多 3 次重试，应对限流/瞬时故障；仍失败则入库并标记 ai_failed，不再反复调用。
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL || "deepseek-chat",
          messages: [
            { role: "system", content: "你是严谨的中文科技行业情报分析师。只输出合法JSON，不输出Markdown代码围栏。" },
            { role: "user", content: prompt }
          ],
          temperature: 0.2,
          response_format: { type: "json_object" }
        })
      });
      if (!resp.ok) throw new Error(`DeepSeek API ${resp.status}: ${await resp.text()}`);
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      let parsed;
      try { parsed = JSON.parse(content); } catch { parsed = { category: "行业动态", summary: content, importance: 3 }; }
      return { ...parsed, status: "analyzed" };
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
    }
  }

  console.error("DeepSeek failed after 3 attempts:", String(lastErr));
  return {
    category: "行业动态",
    summary: item.description || "AI 分析暂不可用，保留原始摘要。",
    technical_analysis: "",
    industry_impact: "",
    importance: 3,
    status: "ai_failed"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
