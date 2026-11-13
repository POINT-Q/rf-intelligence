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
async function load() {
  const box = document.querySelector("#news");
  box.innerHTML = '<div class="empty">正在加载…</div>';
  try {
    const res = await fetch(`/api/news?category=${encodeURIComponent(active)}&limit=60`);
    const data = await res.json();
    const items = data.items || [];
    document.querySelector("#total").textContent = items.length;
    document.querySelector("#updated").textContent = `最近读取：${new Date().toLocaleString("zh-CN")}`;
    if (!items.length) { box.innerHTML = '<div class="empty">情报库暂时没有记录。部署并配置定时采集后，这里将显示每日更新内容。</div>'; return; }
    box.innerHTML = "";
    items.forEach(n => {
      const el = document.createElement("article"); el.className = "item";
      const date = n.published_at ? new Date(n.published_at).toLocaleDateString("zh-CN") : "日期待确认";
      el.innerHTML = `<div class="item-top"><span class="tag">${esc(n.category)}</span><span>${esc(n.source)} · ${esc(date)}</span></div>
        <h3>${esc(n.title)}</h3><p>${esc(n.summary || "")}</p>
        ${n.technical_analysis ? `<div class="detail"><b>技术解读</b><p>${esc(n.technical_analysis)}</p><b>行业影响</b><p>${esc(n.industry_impact || "待补充")}</p></div>` : ""}
        <p><a href="${safeUrl(n.url)}" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a></p>`;
      box.appendChild(el);
    });
  } catch(e) { box.innerHTML = '<div class="empty">暂时无法连接情报服务，请检查部署和数据库配置。</div>'; }
}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function safeUrl(s=""){try{const u=new URL(s);return ["https:","http:"].includes(u.protocol)?u.href:"#"}catch{return "#"}}
load();