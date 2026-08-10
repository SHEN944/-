/* ================================================
 * 旅途手账 · AI 旅行攻略生成器
 * 搜索优先级：抖音 (douyin.com) > 小红书 (xiaohongshu.com)
 * ================================================ */

/* ========== 真实 API 配置区 ==========
 * 如需接入真实的抖音开放平台 / 小红书开放平台 API，
 * 请在对应平台申请开发者权限后，将你的后端代理地址填入下方：
 *
 * 抖音开放平台：https://developer.open-douyin.com/
 * 小红书开放平台：https://developer.xiaohongshu.com/
 *
 * 注意：由于浏览器跨域限制，API 调用需通过自己的后端代理。
 */
const API_CONFIG = {
  douyinProxy: '',    // e.g. '/api/douyin/search'
  xhsProxy: '',       // e.g. '/api/xhs/search'
  llmProxy: '',       // e.g. '/api/llm/generate'  （AI 生成接口）
  useMockWhenNoApi: true,  // 无 API 时使用智能模拟数据
};

/* ========== 日期工具 ========== */
function pad2(n){ return String(n).padStart(2,'0'); }
function todayStr(){
  const d=new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function addDaysStr(dateStr, n){
  const d=new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function diffDays(a, b){
  const da=new Date(a+'T00:00:00').getTime();
  const db=new Date(b+'T00:00:00').getTime();
  return Math.round((db-da)/86400000);
}
function fmtDateCN(dateStr){
  if(!dateStr) return '';
  const d=new Date(dateStr+'T00:00:00');
  return `${d.getMonth()+1}月${d.getDate()}日`;
}
/* 由出发/返程日期推算天数，并写回 state.days */
function computeDays(){
  const s=state.startDate, e=state.endDate;
  if(!s||!e){ state.days=1; return; }
  let d=diffDays(s,e)+1;
  state.days = d<1 ? 1 : d;
}

/* ========== 地图 / 平台跳转链接（高德 & 腾讯 & 携程） ========== */
function amapSearchUrl(keyword, city){
  const q = city ? `${city} ${keyword}` : keyword;
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(q)}${city?`&city=${encodeURIComponent(city)}`:''}`;
}
function qqMapSearchUrl(keyword, city){
  const q = city ? `${city} ${keyword}` : keyword;
  return `https://apis.map.qq.com/uri/v1/search?keyword=${encodeURIComponent(q)}&referer=trae-travel`;
}
function ctripHotelUrl(dest, hotelName, checkIn, checkOut){
  const p = new URLSearchParams();
  if(dest) p.set('cityName', dest);
  if(hotelName) p.set('keyword', hotelName);
  if(checkIn) p.set('checkIn', checkIn);
  if(checkOut) p.set('checkOut', checkOut);
  return `https://hotels.ctrip.com/hotels/list?${p.toString()}`;
}
/* 景点/地点的地图定位入口：高德 + 腾讯，用户自选其一打开 */
function buildSpotMapLinks(name, address, dest){
  const kw = address ? `${name} ${address}` : name;
  const amap = amapSearchUrl(kw, dest);
  const qq = qqMapSearchUrl(kw, dest);
  return `<div class="spot-map-links"><a class="map-link map-amap" href="${amap}" target="_blank" rel="noopener noreferrer">📍 高德</a><a class="map-link map-qq" href="${qq}" target="_blank" rel="noopener noreferrer">🗺️ 腾讯</a></div>`;
}

/* ========== 全局状态 ========== */
const state = {
  destination: '',
  startDate: addDaysStr(todayStr(), 1),  /* 默认明天出发 */
  endDate: addDaysStr(todayStr(), 3),    /* 默认玩 3 天 */
  days: 3,                                /* 由 startDate/endDate 推算 */
  budget: null,
  style: '经典观光',
  enableSearch: true,
  searchResults: [],
  /* 行程时段：用户可任意组合（解决「上午起不来」等问题），默认全选 */
  slots: { morning: true, noon: true, afternoon: true, evening: true },
};

/* ========== DOM 引用 ========== */
const $ = (id) => document.getElementById(id);
const els = {
  destination: $('destination'),
  startDate: $('startDate'),
  endDate: $('endDate'),
  daysValue: $('daysValue'),
  budget: $('budget'),
  styles: $('styles'),
  slots: $('slots'),
  enableSearch: $('enableSearch'),
  generateBtn: $('generateBtn'),
  searchResults: $('searchResults'),
  searchList: $('searchList'),
  guideResult: $('guideResult'),
  guideContent: $('guideContent'),
  loading: $('loading'),
  loadingText: $('loadingText'),
};

/* ========== 初始化 ========== */
function init() {
  const t = todayStr();
  if (els.startDate) { els.startDate.min = t; els.startDate.value = state.startDate; }
  if (els.endDate)   { els.endDate.min = t;   els.endDate.value = state.endDate; }
  computeDays();
  if (els.daysValue) els.daysValue.textContent = state.days;
  bindEvents();
  validateForm();
}

function bindEvents() {
  els.destination.addEventListener('input', validateForm);
  const onDateChange = () => {
    if (!els.startDate || !els.endDate) return;
    if (els.startDate.value && els.endDate.value && els.startDate.value > els.endDate.value) {
      els.endDate.value = els.startDate.value;
    }
    state.startDate = els.startDate.value;
    state.endDate = els.endDate.value;
    computeDays();
    els.daysValue.textContent = state.days;
  };
  if (els.startDate) els.startDate.addEventListener('change', onDateChange);
  if (els.endDate) els.endDate.addEventListener('change', onDateChange);
  els.budget.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    state.budget = v === '' ? null : Number(v);
  });
  els.styles.addEventListener('click', (e) => {
    const btn = e.target.closest('.style-btn');
    if (!btn) return;
    const isActive = btn.classList.contains('active');
    if (isActive) {
      btn.classList.remove('active');
      state.style = '';
    } else {
      els.styles.querySelectorAll('.style-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.style = btn.dataset.style;
    }
  });
  if (els.slots) {
    els.slots.addEventListener('change', (e) => {
      const cb = e.target.closest('input[type="checkbox"][name="slot"]');
      if (!cb) return;
      const key = cb.value;
      const willBe = els.slots.querySelectorAll('input[name="slot"]:checked').length;
      if (!cb.checked && willBe === 0) {
        cb.checked = true;
        const hint = els.slots.querySelector('.slots-hint');
        if (hint) {
          hint.textContent = '至少需要保留一个时段哦～';
          hint.classList.add('show');
          clearTimeout(els.slots._hintTimer);
          els.slots._hintTimer = setTimeout(() => hint.classList.remove('show'), 2000);
        }
        return;
      }
      state.slots[key] = cb.checked;
    });
  }
  els.enableSearch.addEventListener('change', (e) => {
    state.enableSearch = e.target.checked;
  });
  els.generateBtn.addEventListener('click', handleGenerateGuide);
}

function validateForm() {
  state.destination = els.destination.value.trim();
  const valid = state.destination.length > 0;
  els.generateBtn.disabled = !valid;
}

/* ========== Loading 控制 ========== */
function showLoading(text = '正在处理...') {
  els.loadingText.textContent = text;
  els.loading.classList.remove('hidden');
}
function hideLoading() { els.loading.classList.add('hidden'); }

/* ========== 搜索模块：优先抖音 & 小红书 ========== */
function buildSearchQueries(dest, days, style) {
  const base = `${dest}${style}`;
  return {
    douyin: [
      `${base} 攻略 ${days}天`,
      `${dest} 旅行 vlog 2026`,
      `${dest} 美食推荐 必吃`,
      `${dest} 酒店 住宿测评`,
      `${dest} 小众打卡点`,
    ],
    xiaohongshu: [
      `${base} | ${days}天${days > 1 ? '几' : ''}晚 超详细`,
      `${dest} 拍照机位 出片`,
      `${dest} 避坑 避雷 2026最新`,
      `${dest} 咖啡店 探店`,
      `${dest} 本地人推荐`,
    ],
  };
}

async function fetchLatestNews(dest, days, style) {
  const queries = buildSearchQueries(dest, days, style);
  const results = [];
  if (API_CONFIG.douyinProxy) {
    try {
      for (const q of queries.douyin.slice(0, 2)) {
        const res = await fetch(`${API_CONFIG.douyinProxy}?q=${encodeURIComponent(q)}`).then((r) => r.json());
        if (res && res.data) res.data.forEach((item) => results.push(normalizeDouyin(item)));
      }
    } catch (err) { console.warn('[抖音API] 调用失败：', err); }
  }
  if (API_CONFIG.xhsProxy) {
    try {
      for (const q of queries.xiaohongshu.slice(0, 2)) {
        const res = await fetch(`${API_CONFIG.xhsProxy}?q=${encodeURIComponent(q)}`).then((r) => r.json());
        if (res && res.data) res.data.forEach((item) => results.push(normalizeXhs(item)));
      }
    } catch (err) { console.warn('[小红书API] 调用失败：', err); }
  }
  const needMock = API_CONFIG.useMockWhenNoApi && results.length < 8;
  if (needMock) {
    results.push(...buildMockResults(dest, days, style));
  }
  const now = Date.now();
  const YEAR_AGO_MS = 365 * 24 * 3600 * 1000;
  const freshResults = results.filter((r) => {
    if (!r.publishedAt) return true;
    const age = now - r.publishedAt.getTime();
    return age >= 0 && age <= YEAR_AGO_MS;
  });
  freshResults.forEach((r) => {
    const age = r.publishedAt ? Math.max(0, now - r.publishedAt.getTime()) : 0;
    r.freshScore = Math.max(0, 10000 * (1 - age / YEAR_AGO_MS));
  });
  freshResults.sort((a, b) => (b.freshScore * 2 + b.hotScore) - (a.freshScore * 2 + a.hotScore));
  return freshResults.slice(0, 10);
}

function normalizeDouyin(item) {
  const img = item.video?.cover?.url_list?.[0] || item.cover?.url_list?.[0] || '';
  const ts = item.create_time ? Number(item.create_time) : 0;
  const publishedAt = ts > 0 ? new Date(ts * 1000) : null;
  return {
    source: 'douyin',
    title: item.title || item.desc || '抖音视频',
    author: item.author?.nickname || '抖音用户',
    time: publishedAt ? timeAgo(ts, true) : '1小时内',
    hotScore: (item.stat?.digg_count || 0) + (item.stat?.comment_count || 0) * 2,
    stats: {
      likes: item.stat?.digg_count || 0,
      comments: item.stat?.comment_count || 0,
      shares: item.stat?.share_count || 0,
    },
    snippet: item.desc?.slice(0, 80) || '抖音热门旅行内容',
    url: item.share_url || `https://www.douyin.com/video/${item.aweme_id}`,
    image: img,
    publishedAt: publishedAt,
  };
}

function normalizeXhs(item) {
  const imgList = item.cover || item.image_list || item.images_list || [];
  const img = (typeof imgList === 'string') ? imgList : (imgList[0]?.url_default || imgList[0]?.url || imgList[0] || '');
  const ts = item.time ? Number(item.time) : 0;
  const publishedAt = ts > 0 ? (ts < 1e12 ? new Date(ts * 1000) : new Date(ts)) : null;
  return {
    source: 'xhs',
    title: item.title || item.note_title || '小红书笔记',
    author: item.user?.nickname || '小红书用户',
    time: publishedAt ? timeAgo(ts < 1e12 ? ts : ts / 1000, true) : '30分钟内',
    hotScore: (item.interact_info?.liked_count || 0) + (item.interact_info?.commented_count || 0) * 2 + (item.interact_info?.collected_count || 0) * 3,
    stats: {
      likes: item.interact_info?.liked_count || 0,
      comments: item.interact_info?.commented_count || 0,
      collects: item.interact_info?.collected_count || 0,
    },
    snippet: item.desc?.slice(0, 80) || '小红书热门种草笔记',
    url: item.url || `https://www.xiaohongshu.com/explore/${item.id}`,
    image: img,
    publishedAt: publishedAt,
  };
}

/* ========== 智能 MOCK 数据生成 ========== */
function buildMockResults(dest, days, style) {
  const today = new Date();
  const thisYear = today.getFullYear();
  const MAX_MINUTES_AGO = 365 * 24 * 60;
  const fmtTs = (offsetMinutes) => {
    const safe = Math.max(0, Math.min(offsetMinutes, MAX_MINUTES_AGO));
    const t = new Date(today.getTime() - safe * 60000);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const md = (y !== thisYear ? `${y}年` : '') + `${m}月${d}日`;
    const mins = safe;
    let ago = '';
    if (mins < 60) ago = `${mins}分钟前`;
    else if (mins < 60 * 24) ago = `${Math.floor(mins / 60)}小时前`;
    else ago = `${Math.floor(mins / (60 * 24))}天前`;
    return { text: `${md} ${hh}:${mm} · ${ago}`, dateObj: t, tsSeconds: Math.floor(t.getTime() / 1000) };
  };
  const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const hot = (base) => base + randInt(100, 99999);
  const sharedSnippets = getSnippetsByDestination(dest, style);
  const results = [];
  const douyinTitles = [
    `${dest}${style === '美食之旅' ? '美食探店' : style === '经典观光' ? '必打卡景点' : '旅行'}｜${days}天深度攻略！`,
    `救命🆘 ${dest}这个地方也太美了吧！#${dest}旅行`,
    `本地人带你吃遍${dest}最地道的${style === '美食之旅' ? '美食' : '小吃'}`,
    `${dest}旅行${days}天需要花多少钱？一条视频说清楚`,
    `${dest}小众路线｜避开人流的宝藏打卡点`,
  ];
  const dyTopics = ['打卡路线', '沉浸式体验', '美食探店', '预算参考', '小众景点'];
  douyinTitles.forEach((t, i) => {
    const { text, dateObj } = fmtTs(randInt(10, MAX_MINUTES_AGO));
    results.push({
      source: 'douyin',
      title: t,
      author: ['旅行博主小A', '走走停停', '美食探店君', '穷游攻略', '摄影小姐姐'][i],
      time: text,
      hotScore: hot(20000),
      stats: { likes: hot(5000), comments: hot(200), shares: hot(300) },
      snippet: sharedSnippets.douyin[i] || `${dest}最新旅行视频，真实体验分享，带你沉浸式感受${dest}的${style}魅力。`,
      hotTopic: dyTopics[i] || '旅行vlog',
      url: `https://www.douyin.com/search/${encodeURIComponent(t)}`,
      image: buildSpotImageUrl(t.replace(/[#|｜\d天深度攻略！🆘救命⚠️]/g, '').slice(0, 18) || dest + ' ' + dyTopics[i], dest, style),
      publishedAt: dateObj,
    });
  });
  const xhsTitles = [
    `【${dest}${style}】${days}天${Math.min(days, 2)}晚超详细攻略｜附机位+路线+预算`,
    `${dest}拍照📸｜朋友圈被问爆的出片机位合集`,
    `⚠️去${dest}前必看的${randInt(8, 20)}个避坑建议｜${thisYear}最新`,
    `${dest}酒店测评｜${state.budget ? '¥' + state.budget + '预算内' : '各价位'}住宿推荐`,
    `${dest}宝藏咖啡馆探店｜本地人私藏${randInt(3, 8)}家`,
  ];
  const xhsTopics = ['完整攻略', '出片机位', '避坑指南', '住宿测评', '探店咖啡'];
  xhsTitles.forEach((t, i) => {
    const { text, dateObj } = fmtTs(randInt(5, Math.min(180 * 24 * 60, MAX_MINUTES_AGO)));
    results.push({
      source: 'xhs',
      title: t,
      author: ['芝士就是力量', '旅行中的小茉莉', '摄影日记', '住宿测评师', '咖啡爱好者'][i],
      time: text,
      hotScore: hot(30000),
      stats: { likes: hot(8000), comments: hot(500), collects: hot(3000) },
      snippet: sharedSnippets.xhs[i] || `小红书超火${dest}种草笔记，收藏过万，亲测有效路线分享。`,
      hotTopic: xhsTopics[i] || '旅行攻略',
      url: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(t)}`,
      image: buildSpotImageUrl(t.replace(/[【】⚠️📸｜¥💰]/g, '').slice(0, 20) || dest + ' ' + xhsTopics[i], dest, style),
      publishedAt: dateObj,
    });
  });
  return results;
}

function getSnippetsByDestination(dest, style) {
  return {
    douyin: [
      `${dest}真的太适合${style}了！这${state.days}天下来满满的收获，视频最后有详细路线哦~`,
      `第一次来${dest}被震撼到了，完全颠覆想象，建议先点赞收藏不然划走就找不到了！`,
      `作为一个在${dest}生活了${Math.floor(Math.random()*10)+5}年的本地人，这些店都是我常去的，不好吃你来找我！`,
      `很多朋友问我去${dest}的预算，今天把我${state.days}天的每一笔开销都分享出来~`,
      `${dest}这${Math.floor(Math.random()*3)+2}个小众景点真的绝了，游客少拍照还巨出片！`,
    ],
    xhs: [
      `姐妹们！！这篇${dest}攻略我写了整整3天！！从路线规划到机位再到美食，超级详细，不看真的会后悔😭收藏+关注慢慢看~`,
      `这次${dest}之行最满意的就是出片率💯把私藏的${Math.floor(Math.random()*5)+3}个机位都分享给大家，照着拍绝对不踩雷！`,
      `刚从${dest}回来，踩了${Math.floor(Math.random()*5)+3}个坑，真心建议计划去的宝子们先看看这篇避坑指南🥲`,
      `${dest}住宿怎么选？我把热门区域${Math.floor(Math.random()*5)+3}家酒店都住了个遍，从${state.budget ? '¥' + state.budget + '档' : '平价到奢华'}都有测评！`,
      `${dest}简直是咖啡爱好者的天堂☕这几家宝藏店铺真的不想藏私，装修风格都超有特色！`,
    ],
  };
}

function timeAgo(ts, withDate) {
  const now = Date.now();
  const diff = Math.max(0, now - (ts * 1000));
  const mins = Math.floor(diff / 60000);
  let ago = '';
  if (mins < 60) ago = `${mins}分钟前`;
  else {
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) ago = `${hrs}小时前`;
    else {
      const days = Math.floor(hrs / 24);
      ago = `${days}天前`;
    }
  }
  if (withDate) {
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const curY = new Date().getFullYear();
    const md = (y !== curY ? `${y}年` : '') + `${m}月${day}日`;
    return `${md} · ${ago}`;
  }
  return ago;
}
function fmtNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

/* ========== 渲染搜索结果 ========== */
function renderSearchResults(results) {
  if (!results.length) {
    els.searchList.innerHTML = '<p style="color:var(--text-mute);padding:20px;text-align:center;">暂未搜索到相关资讯</p>';
    bindSearchItemEvents();
    return;
  }
  const sectionHeader = els.searchResults.querySelector('.section-title');
  if (sectionHeader) {
    sectionHeader.innerHTML = '📡 来自抖音 &amp; 小红书的最新资讯 <span class="search-fresh-badge" title="所有在这个网页展示给您的资料/图片，发布日期严格限定在今天往前的一年以内，保证信息和图片都是最新（用户去外平台看原文不在此约束内）">✅ 全部近一年内发布</span>';
  }
  els.searchList.innerHTML = results.map((item, idx) => {
    const isDy = item.source === 'douyin';
    const platform = isDy ? '抖音' : '小红书';
    let fBadge = '';
    try {
      if (item.publishedAt) {
        const ageDays = Math.max(0, Math.floor((Date.now() - item.publishedAt.getTime()) / (24 * 3600 * 1000)));
        if (ageDays <= 30) fBadge = '<span class="fresh-badge fresh-hot">🔥近30天</span>';
        else if (ageDays <= 180) fBadge = '<span class="fresh-badge fresh-new">🆕半年内</span>';
        else fBadge = '<span class="fresh-badge fresh-year">✅近一年</span>';
      } else {
        fBadge = '<span class="fresh-badge fresh-year">✅近一年</span>';
      }
    } catch (e) { fBadge = '<span class="fresh-badge fresh-year">✅近一年</span>'; }
    return `
        <div class="search-item" data-url="${escapeHtml(item.url)}" data-platform="${platform}">
          <div class="source ${isDy ? 'douyin' : 'xhs'}" title="${platform}">
            ${isDy ? '抖' : '红'}
          </div>
          <div class="item-body">
            <div class="item-head">
              <div class="item-title">${escapeHtml(item.title)}</div>
              <a class="item-jump-btn" href="${item.url}" target="_blank" rel="noopener noreferrer" title="立即在${platform}打开（新标签）">
                去${platform}↗
              </a>
            </div>
            <div class="item-meta">
              ${fBadge}
              <span>@${escapeHtml(item.author)}</span>
              <span>·</span>
              <span>${escapeHtml(item.time)}</span>
              <span>·</span>
              <span>👍 ${fmtNum(item.stats.likes)}</span>
              ${item.stats.collects ? `<span>·</span><span>⭐ ${fmtNum(item.stats.collects)}</span>` : ''}
              <span>·</span>
              <span>💬 ${fmtNum(item.stats.comments)}</span>
            </div>
            <div class="item-snippet short">${escapeHtml(item.snippet)}</div>
            <div class="item-detail hidden" data-detail="${idx}">
              <p style="color:var(--text);font-weight:600;margin-bottom:6px;">📖 详细摘要：</p>
              <p style="line-height:1.9;color:var(--text-soft);">${escapeHtml(item.snippet)}</p>
              <div class="item-tags" style="margin-top:8px;">
                <span class="tag">#${escapeHtml(item.hotTopic || (state.destination || '热门') + '旅行')}</span>
                <span class="tag">#${escapeHtml(platform + '热门')}</span>
                ${isDy ? '<span class="tag">#视频更直观</span>' : '<span class="tag">#收藏向攻略</span>'}
              </div>
              <p style="margin-top:10px;font-size:12px;color:var(--text-mute);">
                💡 若摘要足够可直接参考；需要看完整原文 / 视频时，点击右上角「去${platform}↗」按钮在新标签打开（浏览器会后台加载，不用在当前页等待）。
                <br />ℹ️ 在这个网页您看到的资料/图片严格限定在近一年内发布，信息保持最新；跳转到抖音 / 小红书原网站后的内容不受本站约束。
              </p>
            </div>
          </div>
        </div>
      `;
  }).join('');
  els.searchResults.classList.remove('hidden');
  els.searchResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  bindSearchItemEvents();
}

function bindSearchItemEvents() {
  const items = document.querySelectorAll('.search-item');
  items.forEach((it) => {
    const body = it.querySelector('.item-body');
    const detail = it.querySelector('.item-detail');
    const snippet = it.querySelector('.item-snippet');
    const jumpBtn = it.querySelector('.item-jump-btn');
    body.addEventListener('click', (e) => {
      if (e.target === jumpBtn || jumpBtn.contains(e.target)) return;
      const wasHidden = detail.classList.contains('hidden');
      document.querySelectorAll('.search-item .item-detail:not(.hidden)').forEach((d) => {
        if (d !== detail) d.classList.add('hidden');
      });
      detail.classList.toggle('hidden', !wasHidden);
      if (snippet) snippet.classList.toggle('hidden', wasHidden);
    });
    const url = it.dataset.url;
    if (url) {
      let preconnected = false;
      it.addEventListener('mouseenter', () => {
        if (preconnected) return;
        preconnected = true;
        try {
          const host = new URL(url).origin;
          const link = document.createElement('link');
          link.rel = 'preconnect';
          link.href = host;
          document.head.appendChild(link);
        } catch (err) {}
      });
    }
  });
}

const GUIDE_CACHE = new Map();
function cacheKey(dest, startDate, endDate, budget, style) {
  return `${dest}|${startDate}|${endDate}|${budget == null ? 'none' : budget}|${style}`;
}

/* ========== 攻略生成模块 ========== */
async function generateGuide(dest, days, budget, style, news) {
  const key = cacheKey(dest, state.startDate, state.endDate, budget, style);
  if (GUIDE_CACHE.has(key)) return GUIDE_CACHE.get(key);
  if (API_CONFIG.llmProxy) {
    try {
      const res = await fetch(API_CONFIG.llmProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: dest, days, budget, style, news }),
      }).then((r) => r.json());
      if (res && res.html) {
        GUIDE_CACHE.set(key, res.html);
        if (GUIDE_CACHE.size > 30) GUIDE_CACHE.delete(GUIDE_CACHE.keys().next().value);
        return res.html;
      }
    } catch (err) { console.warn('[LLM API] 调用失败：', err); }
  }
  const html = buildGuideMock(dest, days, budget, style, news);
  GUIDE_CACHE.set(key, html);
  if (GUIDE_CACHE.size > 30) GUIDE_CACHE.delete(GUIDE_CACHE.keys().next().value);
  return html;
}

function buildGuideMock(dest, days, budget, style, news) {
  const budgetText = budget ? `每晚¥${budget}` : '不限预算';
  const dyNews = news.filter((n) => n.source === 'douyin').slice(0, 3);
  const xhsNews = news.filter((n) => n.source === 'xhs').slice(0, 3);
  const today = new Date();
  const month = today.getMonth() + 1;
  const season = month >= 3 && month <= 5 ? '春季' :
                 month >= 6 && month <= 8 ? '夏季' :
                 month >= 9 && month <= 11 ? '秋季' : '冬季';
  const styleFocus = {
    '经典观光': { focus: '地标 & 历史景点', tag: ['必打卡', '经典路线', '文化古迹'] },
    '休闲度假': { focus: '放松 & 慢节奏', tag: ['精品酒店', 'SPA', '下午茶'] },
    '探险户外': { focus: '自然 & 户外运动', tag: ['徒步', '露营', '自然风光'] },
    '文化深度游': { focus: '人文 & 历史底蕴', tag: ['博物馆', '老城区', '民俗'] },
    '美食之旅': { focus: '地道美食 & 探店', tag: ['本地人推荐', '老字号', '小吃街'] },
  }[style];
  const daysArr = [];
  const dayThemes = getDayThemes(style, days);
  const allAttractions = getAttractionsPool(dest, style);
  const foods = getFoodPool(dest);
  const slots = (typeof state !== 'undefined' && state.slots) ? state.slots : { morning: true, noon: true, afternoon: true, evening: true };
  const slotDefs = [
    { key: 'morning',   label: '🌅 上午', start: '09:00', end: '11:30', type: 'attraction' },
    { key: 'noon',      label: '🍽️ 中午', start: '12:00', end: '12:45', type: 'meal', duration: '45分钟' },
    { key: 'afternoon', label: '🌇 下午', start: '14:00', end: '17:30', type: 'attraction' },
    { key: 'evening',   label: '🌙 晚上', start: '18:30', end: '19:15', type: 'meal', duration: '45分钟' },
  ];
  const activeSlots = slotDefs.filter((s) => slots[s.key]);
  const activeAttractionSlots = activeSlots.filter((s) => s.type === 'attraction');
  const perDayAttrCount = Math.max(1, activeAttractionSlots.length);
  const scheduledCount = Math.min(days * perDayAttrCount, allAttractions.length);
  const scheduledAttractions = allAttractions.slice(0, scheduledCount);
  const poolAttractions = allAttractions.slice(scheduledCount);
  const renderAttractionCard = (attr, slotKey, dayIdx, img, dest) => `
    <div class="spot-card draggable-spot" draggable="true" data-spot-id="day${dayIdx+1}-${slotKey}" data-spot-name="${escapeHtml(attr.name)}" data-spot-emoji="${attr.emoji}" data-spot-duration="${attr.duration}" data-spot-tag="${attr.tag}" data-spot-address="${escapeHtml(attr.address || '')}" data-spot-imageurl="${escapeHtml(img)}">
      <div class="spot-photo"><img src="${img}" alt="${escapeHtml(attr.name)} 实景图" loading="lazy" onerror="this.onerror=null;this.src='https://loremflickr.com/500/500/travel,landmark,city?lock='+Math.floor(Math.random()*9999)"/><span class="spot-photo-emoji">${attr.emoji}</span></div>
      <div class="spot-info">
        <div class="spot-name">${escapeHtml(attr.name)}</div>
        <div class="spot-meta">⏱ ${attr.duration} · #${attr.tag}${attr.address ? `<br />📍 ${escapeHtml(attr.address)}` : ''}</div>
        ${buildSpotMapLinks(attr.name, attr.address, dest)}
      </div>
      <span class="spot-grip" title="拖拽替换">⠿</span>
    </div>
  `;
  const renderMealPlaceholder = (s) => `
    <div class="meal-placeholder" data-type="${s.key}">
      <div class="meal-icon">${s.key === 'noon' ? '🍜' : '🍽️'}</div>
      <div class="meal-body">
        <div class="meal-title">${s.key === 'noon' ? '午餐时间' : '晚餐时间'}<span class="meal-duration">· ${s.duration || '45分钟'}</span></div>
        <div class="meal-desc">自由用餐时段：走到哪吃到哪，不必按推荐找。附近搜当地点评 App 可以直接看附近实时评分人气店。</div>
      </div>
    </div>
  `;
  for (let i = 0; i < days; i++) {
    let attrIdx = 0;
    const slotRows = activeSlots.map((s) => {
      let bodyHtml = '';
      if (s.type === 'attraction') {
        const attr = scheduledAttractions[i * perDayAttrCount + attrIdx] || scheduledAttractions[attrIdx] || allAttractions[0];
        attrIdx++;
        const img = pickSpotImageFromNews(attr.name, dest, style, news);
        const cardHtml = renderAttractionCard(attr, s.key, i, img, dest);
        bodyHtml = `
            <div class="slot-cards" data-day-idx="${i}" data-slot-key="${s.key}">
              ${cardHtml}
            </div>
            <button class="add-spot-btn" type="button" data-day-idx="${i}" data-slot-key="${s.key}">＋ 添加景点到此时段</button>`;
      } else if (s.type === 'meal') {
        bodyHtml = renderMealPlaceholder(s);
      }
      return `
          <div class="slot-row" data-slot-key="${s.key}" data-day-idx="${i}">
            <div class="slot-label">
              <span class="slot-emoji-text">${s.label}</span>
              <div class="slot-time-row">
                <input type="time" class="slot-time-input" value="${s.start}" title="开始时间（像手机闹钟一样自由设定）" />
                <span class="slot-time-arrow">→</span>
                <input type="time" class="slot-time-input slot-time-input-end" value="${s.end}" title="结束时间" />
              </div>
            </div>
            ${bodyHtml}
          </div>`;
    }).join('');
    const slotsHtml = slotRows || `<p style="color:var(--text-mute);padding:12px;text-align:center;">这一天没有选择任何时段，可在上方表单勾选需要的时段后重新生成。</p>`;
    daysArr.push(`
      <div class="day-block">
        <p><strong>Day ${i + 1} · ${dayThemes[i] || dayThemes[0]}</strong></p>
        <div class="day-slots">
          ${slotsHtml}
        </div>
      </div>
    `);
  }
  const hotelRecs = getHotelRecommendations(dest, budget);
  const packingList = [
    '证件：身份证/护照、学生证、驾照（如需租车）',
    '衣物：${season}服饰、舒适徒步鞋、换洗衣物',
    '电子：充电宝、充电线、耳机、相机',
    '洗护：洗漱用品、防晒霜、面膜、护肤品',
    '药品：感冒药、肠胃药、晕车药、创可贴',
    style === '探险户外' ? '户外：登山杖、背包、水壶、冲锋衣' : '',
    style === '休闲度假' ? '度假：泳衣、墨镜、沙滩巾、防晒衣' : '',
  ].filter(Boolean).map((s) => s.replace('${season}', season));
  return `
    <div class="guide-section">
      <h3><span class="sec-icon">📋</span>行程概览</h3>
      <p><strong>目的地：</strong>${dest}　｜　<strong>行程：</strong>${days} 天（${fmtDateCN(state.startDate)} - ${fmtDateCN(state.endDate)}）　｜　<strong>风格：</strong>${style}　｜　<strong>酒店预算：</strong>${budgetText}</p>
      <div class="tag-row">
        ${styleFocus.tag.map((t) => `<span class="tag">#${t}</span>`).join('')}
        <span class="tag">${season}</span>
        <span class="tag">数据来源: 抖音+小红书</span>
      </div>
    </div>
    <div class="guide-section">
      <h3><span class="sec-icon">🗺️</span>每日详细行程</h3>
      <p style="margin-bottom:12px;color:var(--text-soft);font-size:13px;line-height:1.9;">
        💡 <b>时间你自己定，不被推着走</b>：左侧「开始 → 结束」两个时间可以随意改（像手机闹钟一样点一下就弹滚轮），上午起不来就调晚点~<br />
        🔁 <strong>替换</strong>：把下方「备选景点池」的景点拖到上午/下午格子直接替换；已排景点也可拖回备选池。<br />
        ➕ <strong>添加</strong>：点每个时段下方的「＋ 添加景点到此时段」按钮，从备选池选一个追加，<strong>时间会自动按景点数均分</strong>并在每个景点上显示建议时段。
      </p>
      ${daysArr.join('')}
    </div>
    <div class="guide-section">
      <h3><span class="sec-icon">🎒</span>备选景点池（时间不够？拖上去替换！）</h3>
      <p style="margin-bottom:12px;color:var(--text-soft);font-size:13px;">以下景点因行程时间有限未能排入，你可以<strong>拖拽</strong>其中任意一个到上方行程的上午/下午格子进行替换。也可将上方已排景点拖回此处。</p>
      <div class="pool-grid" id="spotPool">
        ${poolAttractions.map((a, i) => {
          const img = pickSpotImageFromNews(a.name, dest, style, news);
          return `
          <div class="spot-card pool-spot draggable-spot" draggable="true" data-spot-id="pool-${i}" data-spot-name="${escapeHtml(a.name)}" data-spot-emoji="${a.emoji}" data-spot-duration="${a.duration}" data-spot-tag="${a.tag}" data-spot-address="${escapeHtml(a.address || '')}" data-spot-imageurl="${escapeHtml(img)}">
            <div class="spot-photo"><img src="${img}" alt="${escapeHtml(a.name)} 照片" loading="lazy" onerror="this.onerror=null;this.src='https://loremflickr.com/500/500/travel,landmark,city?lock='+Math.floor(Math.random()*9999)"/><span class="spot-photo-emoji">${a.emoji}</span></div>
            <div class="spot-info">
              <div class="spot-name">${escapeHtml(a.name)}</div>
              <div class="spot-meta">⏱ ${a.duration} · #${a.tag}${a.address ? `<br />📍 ${escapeHtml(a.address)}` : ''}</div>
              ${buildSpotMapLinks(a.name, a.address, dest)}
            </div>
            <span class="spot-grip" title="拖拽到上方行程替换">⠿</span>
          </div>
        `;}).join('')}
      </div>
    </div>
    <div class="guide-section">
      <h3><span class="sec-icon">🍽️</span>美食推荐</h3>
      <ul>
        ${foods.slice(0, 6).map((f) => `<li><strong>${f}</strong>：抖音 / 小红书高频推荐，建议前往人气最旺的老字号或本地热门分店</li>`).join('')}
      </ul>
    </div>
    <div class="guide-section">
      <h3><span class="sec-icon">🏨</span>住宿推荐（${budgetText}${state.startDate ? ` · 入住${fmtDateCN(state.startDate)}·离店${fmtDateCN(state.endDate)}·${Math.max(1, state.days - 1)}晚` : ''}）</h3>
      <p style="margin-bottom:16px;color:var(--text-soft);font-size:14px;">以下酒店 &amp; 房型为参考推荐，<strong>价格仅供参考</strong>（旺季浮动、低价房型可能售罄或下架）。请点击每家酒店的 <strong>「携程查实时价」</strong> 按你的入住/离店日期获取真实报价，或点 <strong>「高德看位置」</strong> 确认地理位置。</p>
      ${renderHotelCards(hotelRecs, dest)}
    </div>
    ${xhsNews.length ? `
    <div class="guide-section">
      <h3><span class="sec-icon">⚠️</span>来自小红书的避坑建议</h3>
      <ul>
        ${xhsNews.map((n) => `<li><a href="${n.url}" target="_blank" rel="noopener noreferrer" style="color:var(--xhs);">${escapeHtml(n.title)}</a> - @${escapeHtml(n.author)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    ${dyNews.length ? `
    <div class="guide-section">
      <h3><span class="sec-icon">🎬</span>抖音热门旅行视频</h3>
      <ul>
        ${dyNews.map((n) => `<li><a href="${n.url}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);">${escapeHtml(n.title)}</a> - 👍 ${fmtNum(n.stats.likes)} · @${escapeHtml(n.author)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    <div class="guide-section">
      <h3><span class="sec-icon">🧳</span>行李清单</h3>
      <ul>
        ${packingList.map((p) => `<li>${p}</li>`).join('')}
      </ul>
    </div>
    <div class="guide-section">
      <h3><span class="sec-icon">💸</span>预算估算（人均）</h3>
      ${estimateBudget(days, budget)}
    </div>
  `;
}

function getDayThemes(style, days) {
  const map = {
    '经典观光': ['初抵目的地·经典地标打卡', '深度探索·博物馆与历史', '城市漫游·小众景点', '近郊一日游', '购物返程'],
    '休闲度假': ['抵达入住·酒店放松', '海边/景区慢享', 'SPA下午茶', '城市漫步', '悠闲返程'],
    '探险户外': ['徒步山地', '露营/溯溪', '高空/水上活动', '自然风光摄影', '休整返程'],
    '文化深度游': ['博物馆日', '老城区人文漫步', '非遗/民俗体验', '当地人家访', '艺术展览'],
    '美食之旅': ['早餐文化', '街头小吃巡礼', '正餐老字号', '夜市探店', '咖啡/甜品地图'],
  };
  const t = map[style] || map['经典观光'];
  return t.slice(0, days).concat(Array(Math.max(0, days - t.length)).fill('自由活动'));
}

function getAttractionsPool(dest, style) {
  const base = [
    { name: `${dest}古城历史文化街区`,   emoji: '🏘️', duration: '2-3h', tag: '经典', address: `${dest}市老城区东大街 · 古城南门入口内50米` },
    { name: `${dest}市民广场（市中心地标）`, emoji: '🏛️', duration: '1-2h', tag: '地标', address: `${dest}市人民大道1号市民广场 · 地铁1号线市民广场站B出口` },
    { name: `${dest}市博物馆`,           emoji: '🏺', duration: '2-3h', tag: '文化', address: `${dest}市文化路88号（市博物馆新馆）· 公交6路博物馆站` },
    { name: `${dest}中央公园`,           emoji: '🌳', duration: '2h',   tag: '休闲', address: `${dest}市公园南路1号中央公园南门 · 全程免费开放` },
    { name: `${dest}西山国家森林公园`,    emoji: '🏔️', duration: '半天', tag: '自然', address: `${dest}市西郊风景区西山路201号 · 距市区约18km，打车30分钟` },
    { name: `${dest}创意文化产业园`,      emoji: '📸', duration: '1-2h', tag: '网红', address: `${dest}市建设路6号创意园3号楼 · 地铁2号线建设路站C出口` },
    { name: `${dest}大慈寺（古刹）`,     emoji: '🛕', duration: '1-2h', tag: '历史', address: `${dest}市古刹路1号大慈寺 · 老城区北侧山脚，公交3路可到` },
    { name: `${dest}城市之巅观景台`,      emoji: '🔭', duration: '1h',   tag: '观景', address: `${dest}市CBD核心区环球金融中心88层观景台 · 需购票` },
    { name: `${dest}老街综合市场`,        emoji: '🛒', duration: '1-2h', tag: '体验', address: `${dest}市老城区南街120号综合市场 · 南门菜市场旁` },
    { name: `${dest}艺术工厂文创园`,      emoji: '🎨', duration: '2h',   tag: '文艺', address: `${dest}市城东北工业路99号旧工厂改造艺术区 · 公交11路文创园站` },
    { name: `${dest}东湖滨水步道`,        emoji: '🌊', duration: '1-2h', tag: '休闲', address: `${dest}市东湖东岸环湖路 · 东湖公园东门进入，全程免费` },
    { name: `${dest}欢乐世界主题乐园`,    emoji: '🎡', duration: '半天', tag: '亲子', address: `${dest}市近郊乐华路888号欢乐世界 · 城际快巴直达，往返1h` },
    { name: `${dest}青岩古镇`,           emoji: '🏚️', duration: '半天', tag: '人文', address: `${dest}市东郊32公里青岩古镇景区 · 城际公交直达游客中心` },
    { name: `${dest}塔山广播电视塔`,      emoji: '🗼', duration: '1h',   tag: '夜景', address: `${dest}市塔山路1号广播电视塔顶层 · 需购票登顶，夜景必去` },
  ];
  if (style === '美食之旅') {
    base.splice(3, 0, { name: `${dest}老字号小吃街`, emoji: '🍜', duration: '2h', tag: '美食', address: `${dest}市老城区三圣街美食街 · 地铁1号线老城区站A出口30米` });
    base.push({ name: `${dest}滨江夜市一条街`, emoji: '🍻', duration: '2h', tag: '美食', address: `${dest}市滨江路滨河广场夜市 · 17:30开市，地铁4号线滨河路站` });
  }
  if (style === '休闲度假') {
    base.splice(3, 0, { name: `${dest}海滨度假沙滩公园`, emoji: '🏖️', duration: '半天', tag: '度假', address: `${dest}市海滨大道中段101号沙滩公园 · 旅游专线直达` });
    base.push({ name: `${dest}温泉度假区`, emoji: '♨️', duration: '半天', tag: '度假', address: `${dest}市近郊汤泉路66号温泉度假村 · 自驾40分钟可达` });
  }
  if (style === '文化深度游') {
    base.splice(4, 0, { name: `${dest}书院（历史旧址）`, emoji: '📚', duration: '1-2h', tag: '文化', address: `${dest}市书院街27号 · 老城区文庙旁，公交5路可到` });
    base.push({ name: `${dest}名人故居纪念馆`, emoji: '🏛️', duration: '1-2h', tag: '人文', address: `${dest}市故居路12号纪念馆 · 需预约，免费开放` });
  }
  if (style === '探险户外') {
    base.splice(4, 0, { name: `${dest}大峡谷漂流景区`, emoji: '🚣', duration: '半天', tag: '探险', address: `${dest}市西北郊大峡谷景区 · 漂流起点售票处，自驾50分钟` });
    base.push({ name: `${dest}高峰山徒步登山线`, emoji: '🥾', duration: '半天', tag: '自然', address: `${dest}市西北高峰山风景区南门入口 · 登山步道起点` });
  }
  return base;
}

/* ========== 交通耗时估算 ========== */
function estimateDistance(a, b) {
  if (!a || !b || !a.name || !b.name) return 5;
  const aArea = (a.address || '').split('·')[0].trim();
  const bArea = (b.address || '').split('·')[0].trim();
  const sameArea = aArea && bArea && aArea === bArea;
  let hash = 0;
  const s = a.name + b.name;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  const r = Math.abs(hash % 1000) / 1000;
  return sameArea ? (0.8 + r * 2.5) : (3 + r * 15);
}
function estimateTransit(fromAttr, toAttr) {
  const dist = estimateDistance(fromAttr, toAttr);
  return {
    distance: dist.toFixed(1),
    taxi: Math.max(5, Math.round(dist * 2.8 + 3)),
    subway: Math.max(8, Math.round(dist * 2.2 + 10)),
    bus: Math.max(10, Math.round(dist * 4.5 + 5)),
  };
}
function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  let total = h * 60 + m + minutes;
  total = ((total % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
function renderTransitBlock(fromAttr, toAttr, departTime) {
  const t = estimateTransit(fromAttr, toAttr);
  const arriveBySubway = addMinutesToTime(departTime, t.subway);
  return `
    <div class="transit-block">
      <div class="transit-header">
        <span class="transit-route">🧭 ${escapeHtml(fromAttr.name)} → ${escapeHtml(toAttr.name)}</span>
        <span class="transit-dist">≈${t.distance}km</span>
      </div>
      <div class="transit-modes">
        <span class="transit-mode">🚕 打车 <b>${t.taxi}</b>分</span>
        <span class="transit-mode transit-rec">🚇 地铁 <b>${t.subway}</b>分</span>
        <span class="transit-mode">🚌 公交 <b>${t.bus}</b>分</span>
      </div>
      <div class="transit-timing">
        <span class="t-depart">⏰ ${departTime} 出发</span>
        <span class="t-arrow">→</span>
        <span class="t-arrive">📍 ${arriveBySubway} 到达</span>
      </div>
    </div>
  `;
}

function getFoodPool(dest) {
  return [
    `${dest}特色面食`,
    `${dest}本地炒菜馆`,
    `${dest}小吃街必打卡`,
    `${dest}招牌火锅/烧烤`,
    `${dest}老字号甜品店`,
    `${dest}早茶文化`,
    `${dest}海鲜 / 河鲜`,
    `${dest}创意融合菜`,
    `${dest}人气咖啡 / 茶馆`,
  ];
}

function getHotelRecommendations(dest, budget) {
  return getHotelPreset(dest, budget);
}

function getHotelPreset(dest, budget) {
  const brandPool = {
    budget: [
      { name: '如家商旅酒店', tag: ['连锁品牌', '近地铁', '免费早餐'], rating: 4.4 },
      { name: '汉庭优佳酒店', tag: ['干净卫生', '性价比高', '24h前台'], rating: 4.3 },
      { name: dest + '青年旅舍', tag: ['社交氛围', '床位/双人间', '位置好'], rating: 4.6 },
      { name: '7天优品Premium', tag: ['经济型', '自助入住', '交通便利'], rating: 4.2 },
    ],
    mid: [
      { name: dest + '城市中心亚朵酒店', tag: ['阅读空间', '暖心服务', '洗衣房'], rating: 4.7 },
      { name: '桔子水晶酒店（'+dest+'店）', tag: ['设计感', '安静', '早餐丰盛'], rating: 4.6 },
      { name: dest + '璞石·精品民宿', tag: ['网红打卡', 'ins风', '管家服务'], rating: 4.8 },
      { name: '全季酒店（'+dest+'旗舰店）', tag: ['东方禅意', '零压床', '茶香'], rating: 4.6 },
      { name: dest + '花间堂·人文客栈', tag: ['文化体验', '老建筑改造', '四合院'], rating: 4.7 },
    ],
    high: [
      { name: '希尔顿大酒店（'+dest+'店）', tag: ['五星品牌', '行政酒廊', '健身中心'], rating: 4.8 },
      { name: dest + '君悦酒店', tag: ['奢华体验', '天际景观', '米其林餐厅'], rating: 4.9 },
      { name: '万豪度假酒店（'+dest+'店）', tag: ['度假型', '泳池', '亲子友好'], rating: 4.7 },
      { name: dest + '安缦·疗愈度假村', tag: ['隐世秘境', '私人管家', 'SPA'], rating: 5.0 },
      { name: '凯悦臻选·'+dest+'府邸', tag: ['历史建筑', '私宴', '艺术收藏'], rating: 4.8 },
    ],
    free: [
      { name: dest + '中心假日酒店', tag: ['地标位置', '商业圈中心'], rating: 4.5 },
      { name: dest + '古城·百年老宅精品民宿', tag: ['历史人文', '本地生活体验'], rating: 4.7 },
      { name: dest + '山海景度假酒店', tag: ['一线景观', '私家海滩/山景'], rating: 4.8 },
    ],
  };
  const roomTypes = [
    { type: '标准大床房', bed: '1.8m 大床', size: rand(22, 28) + '㎡', view: '城市/庭院景观', image: 'bedroom', amenities: ['免费WiFi', '空调', '独立卫浴'] },
    { type: '标准双床房', bed: '2×1.2m 单人床', size: rand(24, 30) + '㎡', view: '城市/庭院景观', image: 'twin', amenities: ['免费WiFi', '空调', '双台盆卫浴'] },
    { type: '豪华大床房', bed: '2.0m King Size 大床', size: rand(32, 42) + '㎡', view: '高层景观/园景', image: 'deluxe', amenities: ['免费WiFi', 'Mini Bar', '浴缸', '景观窗'] },
    { type: '行政套房', bed: '2.0m 大床 + 独立客厅', size: rand(48, 68) + '㎡', view: '全景落地窗', image: 'suite', amenities: ['行政酒廊权限', '浴缸+淋浴', '咖啡机', '欢迎水果'] },
    { type: '家庭亲子房', bed: '1.8m + 1.2m 亲子双床', size: rand(36, 50) + '㎡', view: '童趣主题/花园景观', image: 'family', amenities: ['儿童拖鞋/牙具', '玩具', '小帐篷', '卡通洗漱用品'] },
    { type: '豪华顶层套房', bed: '主卧+客卧+超大客厅', size: rand(80, 140) + '㎡', view: '360° 城市/海景全景', image: 'penthouse', amenities: ['私人管家', '独立餐厅', '按摩浴缸', '观景露台'] },
  ];
  let tierBrands, tierName, priceFactor;
  if (budget == null) { tierBrands = brandPool.free; tierName = 'free'; priceFactor = [250, 1800]; }
  else if (budget < 300) { tierBrands = brandPool.budget; tierName = 'budget'; priceFactor = [80, budget]; }
  else if (budget < 800) { tierBrands = brandPool.mid; tierName = 'mid'; priceFactor = [Math.max(280, budget-250), budget]; }
  else { tierBrands = brandPool.high; tierName = 'high'; priceFactor = [Math.max(600, budget-200), budget+400]; }
  const hotels = tierBrands.slice(0, Math.min(tierBrands.length, tierName === 'free' ? 3 : 2)).map((brand, idx) => {
    const basePrice = rand(priceFactor[0], priceFactor[1]);
    const rooms = pickRoomsByTier(roomTypes, tierName).map((r, i) => {
      const markup = [0, rand(50, 120), rand(180, 400), rand(500, 1000), rand(250, 500), rand(1500, 3500)][i] || 0;
      return {
        ...r,
        price: basePrice + markup,
        oldPrice: basePrice + markup + rand(100, 300),
        image: buildHotelImageUrl(r.image, idx, i, dest),
        breakfast: i >= 2 ? '含双人早餐' : '早餐可加购 ¥' + rand(30, 68),
        cancel: i % 2 === 0 ? '免费取消（入住前1天18:00前）' : '不可取消',
      };
    });
    return {
      name: brand.name,
      area: getLocationNameByTier(dest, idx, tierName),
      desc: getHotelDescByTier(dest, tierName, idx),
      tags: brand.tag,
      rating: brand.rating,
      reviews: rand(280, 8900),
      cover: buildHotelCoverUrl(idx, tierName, dest),
      facilities: pickFacilitiesByTier(tierName),
      rooms: rooms,
    };
  });
  return hotels;
}

function pickRoomsByTier(rooms, tier) {
  if (tier === 'budget') return [rooms[0], rooms[1], rooms[4]].filter(Boolean);
  if (tier === 'mid') return [rooms[0], rooms[1], rooms[2], rooms[4]];
  if (tier === 'high') return [rooms[2], rooms[3], rooms[4], rooms[5]];
  return [rooms[0], rooms[1], rooms[2], rooms[3]];
}
function getLocationNameByTier(dest, i, tier) {
  const locs = {
    budget: [dest + '地铁1号线沿线 · 距市中心 2km', dest + '火车站附近 · 步行 10 分钟', dest + '大学城旁 · 交通便利'],
    mid: [dest + '核心商圈 · 步行可达美食街', dest + '老城区历史街区 · 紧邻景点', dest + '滨江/半山景观带', dest + 'CBD 金融中心'],
    high: [dest + ' CBD 地标建筑 · 地铁直达', dest + '海滨/山景度假区 · 私属领地', dest + '古城核心 · 百年历史保护建筑', dest + '山顶/湖畔观景地块'],
    free: [dest + '市中心 · 核心商圈地铁上盖', dest + '老城区 / 历史人文街区', dest + '景区 / 度假带一线景观'],
  };
  const arr = locs[tier] || locs.free;
  return arr[i % arr.length];
}
function getHotelDescByTier(dest, tier, i) {
  const descs = {
    budget: ['性价比首选，房间干净整洁，前台 24h 服务，位置便利。', '连锁品牌统一标准，出门即地铁口，出行无忧。'],
    mid: ['位置绝佳，步行即可逛遍老城区美食街。房间温馨舒适，服务贴心，住得放心。', '设计感满满，非常出片！管家服务响应快，早餐本地特色好评如潮。'],
    high: ['五星品牌品质保证，全景落地窗俯瞰城市天际线，行政酒廊自助下午茶十分惬意。', '隐世度假体验，私享自然景观，配私人管家和顶级 SPA，行程中的完美疗愈站。'],
    free: ['位置核心，从经济型到奢华房型都有，吃喝购物非常方便。', '老建筑改造精品，沉浸式感受本地文化，体验深度。', '一线海景/山景，度假首选，环境优美。'],
  };
  const arr = descs[tier] || descs.free;
  return arr[i % arr.length];
}
function pickFacilitiesByTier(tier) {
  const base = ['免费WiFi', '24h前台', '行李寄存', '电梯'];
  if (tier === 'budget') return base.concat(['自助洗衣', '便利店']);
  if (tier === 'mid') return base.concat(['自助早餐', '自助洗衣房', '健身房', '咖啡吧', '停车场']);
  return base.concat(['行政酒廊', '健身房', '泳池', 'SPA', '商务中心', '免费停车', '接机服务', '儿童乐园']);
}

function buildHotelCoverUrl(idx, tier, dest) {
  const keywords = [
    'luxury,hotel,architecture',
    'boutique,hotel,old,building',
    'resort,hotel,pool,sunset',
  ];
  const k = keywords[idx % keywords.length];
  return `https://loremflickr.com/800/450/${k}?lock=h${idx}`;
}
function buildHotelImageUrl(roomStyle, hotelIdx, roomIdx, dest) {
  const map = {
    bedroom:   'hotel,bedroom,interior',
    twin:      'hotel,room,twin,bed',
    deluxe:    'hotel,deluxe,room,city,view',
    suite:     'hotel,suite,living,room',
    family:    'hotel,family,room,kids',
    penthouse: 'hotel,penthouse,luxury',
  };
  const k = map[roomStyle] || map.bedroom;
  const seed = `r${hotelIdx}${roomIdx}`;
  return `https://loremflickr.com/600/450/${k}?lock=${seed}`;
}

function buildSpotImageUrl(spotName, dest, style) {
  const spot = String(spotName || dest + '景点');
  const has = (kw) => spot.includes(kw);
  let kw = 'travel,attraction,sightseeing';
  if (has('古城') || has('老城') || has('步行') || has('寺庙') || has('历史') || has('古村') || has('古村落') || has('老宅') || has('非遗') || has('民俗')) {
    kw = 'ancient,architecture,heritage,china';
  } else if (has('海边') || has('海滨') || has('沙滩') || has('湖畔') || has('河滨') || has('海景') || has('山水') || has('自然') || has('山景')) {
    kw = 'landscape,scenic,nature,mountain';
  } else if (has('美食') || has('小吃') || has('火锅') || has('烧烤') || has('咖啡') || has('甜品') || has('茶馆') || has('早餐') || has('餐厅') || has('咖啡馆')) {
    kw = 'food,restaurant,cuisine,chinese';
  } else if (has('博物馆') || has('文化馆') || has('艺术') || has('展览')) {
    kw = 'museum,art,exhibition,gallery';
  } else if (has('公园') || has('花园')) {
    kw = 'park,green,garden,outdoor';
  } else if (has('地标') || has('广场') || has('建筑') || has('观景') || has('旋转') || has('摩天')) {
    kw = 'landmark,architecture,skyline,city';
  } else if (has('夜市') || has('夜景')) {
    kw = 'night,market,neon,street';
  } else if (has('网红') || has('打卡')) {
    kw = 'instagram,trendy,place,photo';
  } else if (has('亲子') || has('乐园') || has('游乐场')) {
    kw = 'amusement,park,family,fun';
  } else if (has('市场') || has('集市') || has('购物')) {
    kw = 'market,shopping,street,vendor';
  } else if (has('摄影') || has('机位') || has('出片')) {
    kw = 'photography,viewpoint,scenic,landscape';
  }
  const hash = Array.from(spot).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  return `https://loremflickr.com/500/500/${kw}?lock=s${Math.abs(hash) % 9999}`;
}

function pickSpotImageFromNews(spotName, dest, style, news) {
  const fallback = buildSpotImageUrl(spotName, dest, style);
  if (!Array.isArray(news) || !news.length) return fallback;
  const core = String(spotName || '').replace(dest, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const keywords = new Set();
  keywords.add(dest);
  if (core) keywords.add(core);
  const parts = String(spotName).split(/[\/\s\-、()（）]/).filter(Boolean);
  parts.forEach((p) => {
    const clean = p.replace(/[·\d\s]/g, '');
    if (clean.length >= 2) keywords.add(clean);
  });
  [...keywords].forEach((k) => { if (k.length < 2) keywords.delete(k); });
  const NOW = Date.now();
  const YEAR_MS = 365 * 24 * 3600 * 1000;
  let best = null;
  let bestScore = 0;
  news.forEach((n) => {
    if (!n || !n.image) return;
    const hay = `${n.title || ''} ${n.snippet || ''} ${n.hotTopic || ''}`;
    let hit = 0;
    keywords.forEach((kw) => { if (hay.includes(kw)) hit++; });
    if (hit === 0) return;
    let score = hit * 10;
    if (n.source === 'xhs') score += 2;
    if ((n.title || '').includes(dest)) score += 1;
    if (typeof n.freshScore === 'number') {
      score += n.freshScore / 1000;
    } else if (n.publishedAt) {
      const age = Math.max(0, NOW - n.publishedAt.getTime());
      if (age <= YEAR_MS) score += (1 - age / YEAR_MS) * 10;
      else return;
    } else {
      score += 5;
    }
    if (score > bestScore) { bestScore = score; best = n.image; }
  });
  return best || fallback;
}

function estimateBudget(days, budget) {
  const night = Math.max(1, days - 1);
  const hotel = (budget || 400) * night;
  const food = days * rand(150, 300);
  const transport = days * rand(50, 150) + rand(200, 800);
  const tickets = days * rand(80, 200);
  const other = rand(300, 800);
  const total = hotel + food + transport + tickets + other;
  return `
    <ul>
      <li>🏨 住宿：¥${hotel}（${night} 晚 × ${budget ? '¥' + budget : '约 ¥400'}）</li>
      <li>🍜 餐饮：¥${food}（约 ¥${Math.round(food / days)} / 天）</li>
      <li>🚇 交通：¥${transport}（当地交通 + 往返大交通估算）</li>
      <li>🎫 门票：¥${tickets}（景点 / 演出）</li>
      <li>🛍️ 其他：¥${other}（购物 / 伴手礼 / 杂费）</li>
    </ul>
    <p style="margin-top:10px;color:var(--primary);font-weight:700;">💰 合计预计：¥${total} / 人</p>
  `;
}

function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===== 酒店卡片渲染 ===== */
function renderHotelCards(hotels, dest) {
  const checkIn = state.startDate || '';
  const checkOut = state.endDate || '';
  return hotels.map((h) => `
    <div class="hotel-card">
      <div class="hotel-cover">
        <img src="${h.cover}" alt="${escapeHtml(h.name)} 封面" loading="lazy" onerror="this.onerror=null;this.src='https://loremflickr.com/800/450/luxury,hotel,resort?lock='+Math.floor(Math.random()*9999)"/>
      </div>
      <div class="hotel-head">
        <div class="hotel-title-row">
          <h4 class="hotel-name">${escapeHtml(h.name)}</h4>
          <div class="hotel-rating">
            <span class="rating-score">${h.rating}</span>
            <span class="rating-stars">${'★'.repeat(Math.round(h.rating))}</span>
            <span class="rating-count">${fmtNum(h.reviews)} 条真实评价</span>
          </div>
        </div>
        <div class="hotel-location">📍 ${escapeHtml(h.area)}</div>
        <div class="hotel-tags">
          ${h.tags.map((t) => `<span class="hotel-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="hotel-desc">${escapeHtml(h.desc)}</div>
        <div class="hotel-facilities">
          <strong style="font-size:13px;color:var(--text);">酒店设施：</strong>
          ${h.facilities.map((f)=>`<span class="facility">${escapeHtml(f)}</span>`).join('')}
        </div>
        <div class="hotel-actions">
          <a class="hotel-cta ctrip" href="${ctripHotelUrl(dest, h.name, checkIn, checkOut)}" target="_blank" rel="noopener noreferrer">🔍 携程查实时价</a>
          <a class="hotel-cta amap" href="${amapSearchUrl(h.name, dest)}" target="_blank" rel="noopener noreferrer">📍 高德看位置</a>
        </div>
      </div>
      <div class="rooms-title">🛏️ 可选房型（右侧为每晚<strong>参考价</strong>，实时价请点上方携程）</div>
      <div class="rooms-list">
        ${h.rooms.map(renderRoomCard).join('')}
      </div>
    </div>
  `).join('');
}

function renderRoomCard(r) {
  return `
    <div class="room-card">
      <div class="room-photo">
        <img src="${r.image}" alt="${escapeHtml(r.type)} 房间图" loading="lazy" onerror="this.onerror=null;this.src='https://loremflickr.com/600/450/hotel,bedroom,interior?lock='+Math.floor(Math.random()*9999)"/>
      </div>
      <div class="room-body">
        <div class="room-head">
          <div class="room-name">${escapeHtml(r.type)}</div>
          <div class="room-price-col">
            <div class="room-old-price">¥${r.oldPrice}</div>
            <div class="room-price">
              <span class="price-unit">¥</span><span class="price-num">${r.price}</span>
              <span class="price-unit">/晚</span>
            </div>
            <div class="room-price-ref">参考价 · 以携程实时为准</div>
          </div>
        </div>
        <div class="room-meta">
          <span class="meta-item">🛏 ${escapeHtml(r.bed)}</span>
          <span class="meta-sep">·</span>
          <span class="meta-item">📐 ${escapeHtml(r.size)}</span>
          <span class="meta-sep">·</span>
          <span class="meta-item">🪟 ${escapeHtml(r.view)}</span>
        </div>
        <div class="room-amenities">
          ${r.amenities.map(a=>`<span class="amenity">${escapeHtml(a)}</span>`).join('')}
        </div>
        <div class="room-policies">
          <span class="policy ${r.cancel.includes('免费')?'policy-free':'policy-strict'}">
            ${r.cancel.includes('免费')?'✅':'⚠️'} ${escapeHtml(r.cancel)}
          </span>
          <span class="policy policy-breakfast">🍳 ${escapeHtml(r.breakfast)}</span>
        </div>
      </div>
    </div>
  `;
}

/* ========== 渲染攻略结果 ========== */
function renderGuide(html) {
  els.guideContent.innerHTML = html;
  els.guideResult.classList.remove('hidden');
  els.guideResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  initDragSwap();
}

/* ========== 景点拖拽替换逻辑 ========== */
let _draggedEl = null;
function initDragSwap() {
  document.querySelectorAll('.draggable-spot').forEach(bindSingleSpotDrag);
  const pool = document.getElementById('spotPool');
  if (pool) {
    pool.addEventListener('dragover', (e) => {
      if (!_draggedEl) return;
      e.preventDefault();
      pool.classList.add('pool-drag-over');
    });
    pool.addEventListener('dragleave', () => {
      pool.classList.remove('pool-drag-over');
    });
    pool.addEventListener('drop', (e) => {
      e.preventDefault();
      pool.classList.remove('pool-drag-over');
      if (!_draggedEl) return;
      const poolSpots = pool.querySelectorAll('.pool-spot');
      if (poolSpots.length && !_draggedEl.classList.contains('pool-spot')) {
        swapSpotData(_draggedEl, poolSpots[0]);
      }
    });
  }
  bindAddSpotButtons();
  document.querySelectorAll('.slot-time-input').forEach((inp) => {
    inp.addEventListener('change', () => {
      refreshAllTransit();
    });
  });
  refreshAllTransit();
}

function bindSingleSpotDrag(spot) {
  spot.querySelectorAll('a, button, input, [role="button"]').forEach((el) => {
    el.addEventListener('mousedown', (ev) => ev.stopPropagation());
    el.addEventListener('dragstart', (ev) => ev.preventDefault());
    el.style.cursor = 'pointer';
  });
  spot.addEventListener('dragstart', (e) => {
    if (e.target.closest('a, button, input, [role="button"]')) { e.preventDefault(); return; }
    _draggedEl = spot;
    spot.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', spot.dataset.spotId);
  });
  spot.addEventListener('dragend', () => {
    spot.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    _draggedEl = null;
  });
  spot.addEventListener('dragover', (e) => {
    if (!_draggedEl || _draggedEl === spot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    spot.classList.add('drag-over');
  });
  spot.addEventListener('dragleave', () => {
    spot.classList.remove('drag-over');
  });
  spot.addEventListener('drop', (e) => {
    e.preventDefault();
    spot.classList.remove('drag-over');
    if (!_draggedEl || _draggedEl === spot) return;
    swapSpotData(_draggedEl, spot);
  });
}

function swapSpotData(elA, elB) {
  const tmp = {
    name: elA.dataset.spotName,
    emoji: elA.dataset.spotEmoji,
    duration: elA.dataset.spotDuration,
    tag: elA.dataset.spotTag,
    id: elA.dataset.spotId,
    imageurl: elA.dataset.spotImageurl || '',
    address: elA.dataset.spotAddress || '',
  };
  elA.dataset.spotName = elB.dataset.spotName;
  elA.dataset.spotEmoji = elB.dataset.spotEmoji;
  elA.dataset.spotDuration = elB.dataset.spotDuration;
  elA.dataset.spotTag = elB.dataset.spotTag;
  elA.dataset.spotId = elB.dataset.spotId;
  elA.dataset.spotImageurl = elB.dataset.spotImageurl || '';
  elA.dataset.spotAddress = elB.dataset.spotAddress || '';
  elB.dataset.spotName = tmp.name;
  elB.dataset.spotEmoji = tmp.emoji;
  elB.dataset.spotDuration = tmp.duration;
  elB.dataset.spotTag = tmp.tag;
  elB.dataset.spotId = tmp.id;
  elB.dataset.spotImageurl = tmp.imageurl;
  elB.dataset.spotAddress = tmp.address;
  updateSpotVisual(elA);
  updateSpotVisual(elB);
  elA.classList.add('swapped');
  elB.classList.add('swapped');
  setTimeout(() => { elA.classList.remove('swapped'); elB.classList.remove('swapped'); }, 600);
  refreshAllTransit();
}

/* ========== 添加景点到时段 ========== */
function bindAddSpotButtons() {
  document.querySelectorAll('.add-spot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dayIdx = btn.dataset.dayIdx;
      const slotKey = btn.dataset.slotKey;
      const next = btn.nextElementSibling;
      if (next && next.classList.contains('add-spot-panel')) {
        next.remove();
        btn.classList.remove('active');
        return;
      }
      const pool = document.getElementById('spotPool');
      if (!pool) return;
      const poolSpots = [...pool.querySelectorAll('.pool-spot')];
      if (!poolSpots.length) {
        const orig = btn.textContent;
        btn.textContent = '备选池已空（可把行程景点拖回池中后再添加）';
        setTimeout(() => { btn.textContent = orig; }, 1800);
        return;
      }
      const panel = document.createElement('div');
      panel.className = 'add-spot-panel';
      panel.innerHTML = '<p class="add-panel-tip">点击下方任一景点即追加到此时段，时间会自动按景点数均分：</p>' +
        poolSpots.map((s) => `
          <div class="add-panel-item" data-pool-id="${s.dataset.spotId}">
            <span class="add-item-emoji">${s.dataset.spotEmoji || '📍'}</span>
            <span class="add-item-name">${escapeHtml(s.dataset.spotName || '')}</span>
            <span class="add-item-meta">${escapeHtml(s.dataset.spotDuration || '')} · ${escapeHtml(s.dataset.spotTag || '')}</span>
          </div>
        `).join('');
      btn.parentNode.insertBefore(panel, btn.nextSibling);
      btn.classList.add('active');
      panel.querySelectorAll('.add-panel-item').forEach((item) => {
        item.addEventListener('click', () => {
          const poolSpot = pool.querySelector(`.pool-spot[data-spot-id="${item.dataset.poolId}"]`);
          if (poolSpot) {
            addToSlot(dayIdx, slotKey, poolSpot);
            panel.remove();
            btn.classList.remove('active');
          }
        });
      });
    });
  });
}

function addToSlot(dayIdx, slotKey, poolSpotEl) {
  const slotRow = document.querySelector(`.slot-row[data-day-idx="${dayIdx}"][data-slot-key="${slotKey}"]`);
  if (!slotRow) return;
  const slotCards = slotRow.querySelector('.slot-cards');
  if (!slotCards) return;
  const newCard = poolSpotEl.cloneNode(true);
  newCard.classList.remove('pool-spot');
  newCard.dataset.spotId = `day${Number(dayIdx)+1}-${slotKey}-add${Date.now()}`;
  const grip = newCard.querySelector('.spot-grip');
  if (grip) grip.title = '拖拽替换 / 拖回备选池';
  slotCards.appendChild(newCard);
  poolSpotEl.remove();
  refreshAllTransit();
  bindSingleSpotDrag(newCard);
  newCard.querySelectorAll('a, button, [role="button"]').forEach((el) => {
    el.addEventListener('mousedown', (ev) => ev.stopPropagation());
    el.addEventListener('dragstart', (ev) => ev.preventDefault());
    el.style.cursor = 'pointer';
  });
  newCard.classList.add('swapped');
  setTimeout(() => newCard.classList.remove('swapped'), 800);
}

/* 时间均分：先扣除交通时间，再分配景点停留时间 */
function redistributeTimes(slotRowEl) {
  const startInput = slotRowEl.querySelector('.slot-time-input:not(.slot-time-input-end)');
  const endInput = slotRowEl.querySelector('.slot-time-input-end');
  const slotCards = slotRowEl.querySelector('.slot-cards');
  if (!startInput || !endInput || !slotCards) return;
  slotCards.querySelectorAll('.transit-block:not(.transit-cross)').forEach((el) => el.remove());
  const cards = [...slotCards.querySelectorAll('.spot-card')];
  if (!cards.length) return;
  const [sh, sm] = startInput.value.split(':').map(Number);
  const [eh, em] = endInput.value.split(':').map(Number);
  let totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin <= 0) totalMin = 60;
  const transitInfos = [];
  let transitTotal = 0;
  for (let i = 0; i < cards.length - 1; i++) {
    const fromA = { name: cards[i].dataset.spotName, address: cards[i].dataset.spotAddress };
    const toA = { name: cards[i + 1].dataset.spotName, address: cards[i + 1].dataset.spotAddress };
    const t = estimateTransit(fromA, toA);
    transitInfos.push(t);
    transitTotal += t.subway;
  }
  const attractionTime = Math.max(10, Math.floor((totalMin - transitTotal) / cards.length));
  const fmt = (min) => {
    const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
    const m = ((min % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  };
  let cursor = sh * 60 + sm;
  cards.forEach((card, idx) => {
    const sMin = cursor;
    const eMin = sMin + attractionTime;
    cursor = eMin;
    let badge = card.querySelector('.spot-time-suggest');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'spot-time-suggest';
      const info = card.querySelector('.spot-info');
      if (info) info.insertBefore(badge, info.firstChild);
    }
    badge.textContent = `⏰ 建议 ${fmt(sMin)} - ${fmt(eMin)}`;
    badge.style.display = cards.length > 1 ? '' : 'none';
    if (idx < cards.length - 1) {
      const fromA = { name: cards[idx].dataset.spotName, address: cards[idx].dataset.spotAddress };
      const toA = { name: cards[idx + 1].dataset.spotName, address: cards[idx + 1].dataset.spotAddress };
      const departTime = fmt(cursor);
      cards[idx + 1].insertAdjacentHTML('beforebegin', renderTransitBlock(fromA, toA, departTime));
      cursor += transitInfos[idx].subway;
    }
  });
}

/* 跨时段交通：上一个时段最后一个景点 → 当前时段第一个景点 */
function refreshCrossSlotTransit() {
  document.querySelectorAll('.day-block').forEach((dayBlock) => {
    const slotRows = [...dayBlock.querySelectorAll('.slot-row')].filter((r) => r.querySelector('.slot-cards'));
    let prevLastCard = null;
    let prevEndInput = null;
    slotRows.forEach((slotRow) => {
      const slotCards = slotRow.querySelector('.slot-cards');
      const oldCross = slotCards.querySelector('.transit-cross');
      if (oldCross) oldCross.remove();
      const firstCard = slotCards.querySelector('.spot-card');
      if (!firstCard) return;
      if (prevLastCard) {
        const fromA = { name: prevLastCard.dataset.spotName, address: prevLastCard.dataset.spotAddress };
        const toA = { name: firstCard.dataset.spotName, address: firstCard.dataset.spotAddress };
        const departTime = prevEndInput ? prevEndInput.value : '12:00';
        firstCard.insertAdjacentHTML('beforebegin', renderTransitBlock(fromA, toA, departTime));
        const justInserted = firstCard.previousElementSibling;
        if (justInserted && justInserted.classList.contains('transit-block')) {
          justInserted.classList.add('transit-cross');
        }
      }
      const allCards = slotCards.querySelectorAll('.spot-card');
      prevLastCard = allCards[allCards.length - 1];
      prevEndInput = slotRow.querySelector('.slot-time-input-end');
    });
  });
}

/* 全量刷新：跨时段交通 + 时段内时间 + 就近推荐徽章 */
function refreshAllTransit() {
  refreshCrossSlotTransit();
  document.querySelectorAll('.slot-row').forEach((slotRow) => {
    if (slotRow.querySelector('.slot-cards')) redistributeTimes(slotRow);
  });
  refreshNearBadges();
}

/* 备选池标注「推荐较近」 */
function refreshNearBadges() {
  document.querySelectorAll('.near-badge').forEach((el) => el.remove());
  const allScheduled = [...document.querySelectorAll('.day-block .spot-card:not(.pool-spot)')];
  if (!allScheduled.length) return;
  const lastCard = allScheduled[allScheduled.length - 1];
  const lastAttr = { name: lastCard.dataset.spotName, address: lastCard.dataset.spotAddress };
  const poolSpots = [...document.querySelectorAll('#spotPool .pool-spot')];
  if (!poolSpots.length) return;
  let minDist = Infinity;
  let nearest = null;
  poolSpots.forEach((ps) => {
    const attr = { name: ps.dataset.spotName, address: ps.dataset.spotAddress };
    const d = estimateDistance(lastAttr, attr);
    if (d < minDist) { minDist = d; nearest = ps; }
  });
  if (nearest) {
    const badge = document.createElement('span');
    badge.className = 'near-badge';
    badge.textContent = '推荐较近';
    badge.title = `距上一个景点约 ${minDist.toFixed(1)}km`;
    nearest.style.position = 'relative';
    nearest.appendChild(badge);
  }
}

function updateSpotVisual(el) {
  const photoImg = el.querySelector('.spot-photo img');
  const photoEmoji = el.querySelector('.spot-photo-emoji');
  const legacyEmoji = el.querySelector('.spot-emoji');
  const name = el.querySelector('.spot-name');
  const meta = el.querySelector('.spot-meta');
  if (photoImg && el.dataset.spotImageurl) {
    photoImg.src = el.dataset.spotImageurl;
    photoImg.alt = (el.dataset.spotName || '景点') + ' 实景图';
  }
  if (photoEmoji && el.dataset.spotEmoji) {
    photoEmoji.textContent = el.dataset.spotEmoji;
  }
  if (legacyEmoji && el.dataset.spotEmoji) {
    legacyEmoji.textContent = el.dataset.spotEmoji;
  }
  if (name && el.dataset.spotName) {
    name.textContent = el.dataset.spotName;
  }
  if (meta) {
    let metaText = '⏱ ' + (el.dataset.spotDuration || '') + ' · #' + (el.dataset.spotTag || '');
    if (el.dataset.spotAddress) {
      metaText += '<br />📍 ' + el.dataset.spotAddress;
    }
    meta.innerHTML = metaText;
  }
  const mapBox = el.querySelector('.spot-map-links');
  const nm = el.dataset.spotName || '';
  const addr = el.dataset.spotAddress || '';
  if (mapBox) {
    mapBox.outerHTML = buildSpotMapLinks(nm, addr, state.destination);
  }
}

/* ========== 事件处理 ========== */
async function handleSearchPreview() {
  if (!state.destination) return;
  showLoading('正在从抖音 & 小红书搜集最新资讯...');
  try {
    const results = await fetchLatestNews(state.destination, state.days, state.style);
    state.searchResults = results;
    renderSearchResults(results);
  } finally {
    hideLoading();
  }
}

async function handleGenerateGuide() {
  if (!state.destination) return;
  const key = cacheKey(state.destination, state.startDate, state.endDate, state.budget, state.style);
  if (state.enableSearch && state.searchResults.length === 0 && !GUIDE_CACHE.has(key)) {
    showLoading('正在为你生成专属旅行攻略（抖音/小红书资料正在后台搜集，稍后补充）...');
    try {
      const guide = await generateGuide(state.destination, state.days, state.budget, state.style, []);
      renderGuide(guide);
      els.searchResults.classList.remove('hidden');
      els.searchList.innerHTML = `
        <div class="search-async-hint">
          <div class="loader-spinner"></div>
          <p>🔎 <b>正在后台从抖音 & 小红书搜集最新资讯...</b></p>
          <p style="color:var(--text-mute);font-size:13px;">行程已生成，可先查看行程 / 酒店 / 必带清单，搜索结果加载完成后自动补到这里 ✨</p>
        </div>`;
      els.searchResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      hideLoading();
    }
    fetchLatestNews(state.destination, state.days, state.style)
      .then((news) => {
        state.searchResults = news;
        generateGuide(state.destination, state.days, state.budget, state.style, news)
          .then((guideFull) => {
            renderGuide(guideFull);
          })
          .catch(() => {});
        renderSearchResults(news);
      })
      .catch((err) => {
        console.warn('[搜索] 后台加载失败：', err);
        els.searchList.innerHTML = '<p style="color:var(--text-mute);padding:20px;text-align:center;">搜索资讯加载失败，可稍后重试</p>';
      });
    return;
  }
  showLoading(state.enableSearch
    ? '正在从抖音 & 小红书搜集资讯并生成攻略，请稍候...'
    : '正在为你生成专属旅行攻略...');
  try {
    let news = state.searchResults;
    if (state.enableSearch && news.length === 0) {
      news = await fetchLatestNews(state.destination, state.days, state.style);
      state.searchResults = news;
      renderSearchResults(news);
    }
    const guide = await generateGuide(state.destination, state.days, state.budget, state.style, news);
    renderGuide(guide);
  } finally {
    hideLoading();
  }
}

/* ========== 启动 ========== */
document.addEventListener('DOMContentLoaded', init);
