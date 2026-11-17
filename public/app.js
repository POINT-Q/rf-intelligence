const categories = ["全部","RF前端","天线技术","通信技术","专业通信","新兴技术","产业竞争","行业动态"];
let active = "全部";
const filters = document.querySelector("#filters");
categories.forEach(c => {
  const b = document.createElement("button");
  b.textContent = c;
  if (c === active) b.classList.add("active");
  b.onclick = () => { active = c; [...filters.children].forEach(x=>x.classList.toggle("active",x.textContent===c)); load(); };
  filters.appendChild(b);
});

function daysAgo(n) {
  const raw = n.published_at || n.fetched_at;
  const t = raw ? Date.parse(raw) : NaN;
  return isNaN(t) ? 9999 : Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function cardHtml(n) {
  const d = daysAgo(n);
  const date = n.published_at ? new Date(n.published_at).toLocaleDateString("zh-CN") : "日期待确认";
  const age = d <= 1 ? "今日" : d <= 7 ? "近7天" : "历史";
  const status = n.status === "analyzed" ? "AI 已解读" : n.status === "ai_failed" ? "AI 分析失败" : (n.status === "ai_pending" ? "待分析" : "新收录");
  return `<article class="item">
    <div class="item-top"><span class="tag">${esc(n.category)}</span><span>${esc(n.source)} · ${esc(date)} · ${age}</span></div>
    <h3>${esc(n.title)}</h3><p>${esc(n.summary || "")}</p>
    ${n.technical_analysis ? `<div class="detail"><b>技术解读</b><p>${esc(n.technical_analysis)}</p><b>行业影响</b><p>${esc(n.industry_impact || "待补充")}</p></div>` : ""}
    <p><a href="${safeUrl(n.url)}" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a> <span class="muted" style="margin-left:12px">${status}</span></p>
  </article>`;
}

// 动态创建"今日重点"和"历史档案"两个容器，避免改动 index.html 与 style.css
function ensureSections() {
  const news = document.querySelector("#news");
  let featured = document.querySelector("#featured");
  if (!featured) {
    featured = document.createElement("section");
    featured.id = "featured";
    featured.style.cssText = "margin-bottom:30px";
    featured.innerHTML = '<div class="section-head"><div><p class="eyebrow">TODAY HIGHLIGHTS</p><h2>今日重点情报</h2></div></div>';
    news.parentNode.insertBefore(featured, news);
  }
  let archive = document.querySelector("#archive");
  if (!archive) {
    archive = document.createElement("section");
    archive.id = "archive";
    archive.style.cssText = "margin-top:36px";
    archive.innerHTML = '<details><summary class="muted" style="cursor:pointer">历史技术档案（点击展开）· 按发布时间归档，不作最新动态</summary><div id="archive-list" class="news" style="margin-top:14px"></div></details>';
    news.parentNode.appendChild(archive);
  }
}

async function load() {
  ensureSections();
  const box = document.querySelector("#news");
  const featured = document.querySelector("#featured");
  box.innerHTML = '<div class="empty">正在加载…</div>';
  featured.insertAdjacentHTML("beforeend", '<div class="empty" id="featured-loading">正在加载…</div>');
  try {
    const [newsRes, statsRes] = await Promise.all([
      fetch(`/api/news?category=${encodeURIComponent(active)}&limit=100`),
      fetch(`/api/stats`)
    ]);
    if (!newsRes.ok) throw new Error("HTTP " + newsRes.status);
    const data = await newsRes.json();
    const items = data.items || [];

    // 总数取全局统计，不随分类变化；stats 失败时回退到已取列表长度
    try {
      if (statsRes.ok) {
        const s = await statsRes.json();
        document.querySelector("#total").textContent = s.total ?? items.length;
        const todayEl = document.querySelector("#today");
        if (todayEl) todayEl.textContent = s.recent ?? 0;
        const analyzedEl = document.querySelector("#analyzed");
        if (analyzedEl) analyzedEl.textContent = s.analyzed ?? 0;
      } else {
        document.querySelector("#total").textContent = items.length;
      }
    } catch { document.querySelector("#total").textContent = items.length; }

    document.querySelector("#updated").textContent = `最近读取：${new Date().toLocaleString("zh-CN")}`;

    if (!items.length) {
      featured.innerHTML = featured.innerHTML.replace('<div class="empty" id="featured-loading">正在加载…</div>', '<div class="empty">暂无重点情报</div>');
      box.innerHTML = '<div class="empty">情报库暂时没有记录。部署并配置定时采集后，这里将显示每日更新内容。</div>';
      return;
    }

    // 时间分层：今日重点 / 近7天 / 历史档案
    const today = items.filter(n => daysAgo(n) <= 1);
    const week = items.filter(n => { const d = daysAgo(n); return d > 1 && d <= 7; });
    const old = items.filter(n => daysAgo(n) > 7);

    const loading = document.querySelector("#featured-loading");
    if (loading) loading.remove();
    const highlights = featured.querySelector("#highlights-list") || (() => {
      const el = document.createElement("div");
      el.id = "highlights-list"; el.className = "news";
      featured.appendChild(el); return el;
    })();
    highlights.innerHTML = today.length
      ? today.map(cardHtml).join("")
      : '<div class="empty">今日暂无新增重点情报</div>';

    box.innerHTML = week.length
      ? week.map(cardHtml).join("")
      : '<div class="empty">近 7 天暂无新动态，可展开下方历史档案查看。</div>';

    document.querySelector("#archive-list").innerHTML = old.length
      ? old.map(cardHtml).join("")
      : '<div class="empty">暂无历史档案</div>';

  } catch(e) {
    featured.innerHTML = featured.innerHTML.replace(/<div class="empty" id="featured-loading">.*?<\/div>/, '<div class="empty">连接失败</div>');
    box.innerHTML = '<div class="empty">暂时无法连接情报服务，请检查部署和数据库配置。</div>';
  }
}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function safeUrl(s=""){try{const u=new URL(s);return ["https:","http:"].includes(u.protocol)?u.href:"#"}catch{return "#"}}
load();
