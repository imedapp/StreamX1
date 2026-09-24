const CONFIG = {
  user: "DJANT52875",
  pass: "DJANTntcbuvr",
  host: "http://zitos.sbs"
};

let allChannels = [], allCategories = [], categoryMap = {}, hls = null, hlsReady = null;
let currentTab = "channels", currentCategory = "all", currentStreamId = null, retryCount = 0;
const MAX_RETRIES = 3;
const $ = id => document.getElementById(id);

function init() {
  setupNav();
  setupPlayer();
  setupSearch();
  setupScroll();
  setupMatchesUI();
  loadData();
}

// ========== lazy-load hls.js ==========
function loadHlsLib() {
  if (hlsReady) return hlsReady;
  hlsReady = new Promise((resolve, reject) => {
    if (window.Hls) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("hls-load-failed"));
    document.head.appendChild(s);
  });
  return hlsReady;
}

// ========== NAVIGATION ==========
function setupNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.onclick = () => {
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      const target = item.dataset.target;
      currentTab = target;
      clearTimeout(matchTimer);

      $("channelsList").classList.add("hidden");
      $("matchesPage").classList.add("hidden");
      $("categoriesBar").classList.add("hidden");
      $("searchSection").classList.remove("hidden");
      $("contentArea").scrollTop = 0;

      if (target === "channels") {
        $("playerContainer").classList.remove("collapsed");
        $("channelsList").classList.remove("hidden");
        $("categoriesBar").classList.remove("hidden");
        currentCategory = "all";
        renderCategories();
        renderChannels(allChannels);
        const v = $("video");
        if (currentStreamId && v.paused) v.play().catch(() => {});
      } else if (target === "matches") {
        const v = $("video");
        if (!v.paused) v.pause();
        $("playerContainer").classList.add("collapsed");
        $("matchesPage").classList.remove("hidden");
        $("searchSection").classList.add("hidden");
        loadMatches();
      }
    };
  });
}

// ========== SCROLL ==========
function setupScroll() {
  const area = $("contentArea"), btn = $("toTop");
  area.addEventListener("scroll", () => {
    btn.classList.toggle("show", area.scrollTop > 400);
  }, { passive: true });
  btn.onclick = () => area.scrollTo({ top: 0, behavior: "smooth" });
}

// ========== PLAYER ==========
function setupPlayer() {
  const video = $("video");
  $("fsBtn").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (video.requestFullscreen) video.requestFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
  };
  video.addEventListener("waiting", () => showPlayerOverlay("جاري التحميل..."));
  video.addEventListener("playing", () => hidePlayerOverlay());
  video.addEventListener("error", () => {
    if (retryCount < MAX_RETRIES && currentStreamId) {
      retryCount++;
      showPlayerOverlay(`إعادة المحاولة ${retryCount}/${MAX_RETRIES}...`);
      setTimeout(() => playStream(currentStreamId, true), 1500);
    } else showPlayerOverlay("فشل التشغيل. جرب قناة أخرى");
  });
}

function showPlayerOverlay(msg) {
  $("playerMsg").textContent = msg;
  $("playerOverlay").classList.add("show");
}

function hidePlayerOverlay() {
  $("playerOverlay").classList.remove("show");
}

// ========== DATA ==========
async function loadData() {
  toggleLoader(true);
  try {
    const [streamsRes, catsRes] = await Promise.all([
      fetch(`${CONFIG.host}/player_api.php?username=${CONFIG.user}&password=${CONFIG.pass}&action=get_live_streams`),
      fetch(`${CONFIG.host}/player_api.php?username=${CONFIG.user}&password=${CONFIG.pass}&action=get_live_categories`)
    ]);
    allChannels = await streamsRes.json();
    allCategories = await catsRes.json();
    categoryMap = {};
    allCategories.forEach(c => { categoryMap[c.category_id] = c.category_name; });
    allCategories.sort((a, b) => a.category_name.localeCompare(b.category_name, "ar"));
    renderCategories();
    renderChannels(allChannels);
    const lastId = localStorage.getItem("last_stream_id");
    if (lastId) {
      const ch = allChannels.find(c => String(c.stream_id) === lastId);
      if (ch) $("nowPlaying").innerHTML = `آخر قناة: <strong>${escapeHtml(ch.name)}</strong>`;
    }
  } catch (err) {
    $("channelsList").innerHTML = `<div class="empty-state"><svg class="icon" style="color:var(--warn)"><use href="#i-alert"></use></svg>فشل تحميل القنوات<br><small>تحقق من الاتصال أو جرب لاحقاً</small></div>`;
  }
  toggleLoader(false);
}

// ========== CATEGORIES ==========
function renderCategories() {
  const bar = $("categoriesBar");
  bar.classList.remove("hidden");
  let html = `<div class="cat-chip ${currentCategory === "all" ? "active" : ""}" data-id="all">الكل (${allChannels.length})</div>`;
  const usedCats = allCategories.filter(c => allChannels.some(ch => String(ch.category_id) === String(c.category_id)));
  usedCats.slice(0, 40).forEach(c => {
    const count = allChannels.filter(ch => String(ch.category_id) === String(c.category_id)).length;
    html += `<div class="cat-chip ${currentCategory === c.category_id ? "active" : ""}" data-id="${c.category_id}">${escapeHtml(c.category_name)} (${count})</div>`;
  });
  bar.innerHTML = html;
  bar.querySelectorAll(".cat-chip").forEach(chip => {
    chip.onclick = () => {
      currentCategory = chip.dataset.id;
      renderCategories();
      filterAndRender();
      $("contentArea").scrollTo({ top: 0, behavior: "smooth" });
    };
  });
}

function filterAndRender() {
  let list = allChannels;
  if (currentCategory !== "all") list = allChannels.filter(c => String(c.category_id) === String(currentCategory));
  const term = $("searchInput").value.trim().toLowerCase();
  if (term) list = list.filter(c => c.name.toLowerCase().includes(term));
  renderChannels(list);
}

// ========== CHANNELS ==========
function renderChannels(channels) {
  const container = $("channelsList");
  if (!channels || !channels.length) {
    container.innerHTML = `<div class="empty-state"><svg class="icon"><use href="#i-tv"></use></svg>لا توجد قنوات</div>`;
    return;
  }
  container.innerHTML = channels.map(ch => {
    const isActive = String(ch.stream_id) === String(currentStreamId);
    const catName = categoryMap[ch.category_id] || "بث مباشر";
    return `<div class="channel-card ${isActive ? "active" : ""}" data-id="${ch.stream_id}" onclick="playStream('${ch.stream_id}')">
      <div class="channel-logo"><img src="${ch.stream_icon || ""}" loading="lazy" onerror="this.style.opacity=0"></div>
      <div class="channel-info"><h3>${escapeHtml(ch.name)}</h3><p>${escapeHtml(catName)}</p></div>
    </div>`;
  }).join("");
}

async function playStream(id, isRetry = false) {
  if (!isRetry) retryCount = 0;
  currentStreamId = id;
  const channel = allChannels.find(c => String(c.stream_id) === String(id));
  if (channel) {
    $("nowPlaying").innerHTML = `<strong>${escapeHtml(channel.name)}</strong>`;
    localStorage.setItem("last_stream_id", id);
  }
  document.querySelectorAll(".channel-card").forEach(card => {
    card.classList.toggle("active", card.dataset.id === String(id));
  });

  const video = $("video");
  const streamUrl = `${CONFIG.host}/live/${CONFIG.user}/${CONFIG.pass}/${id}.m3u8`;
  showPlayerOverlay("جاري الاتصال...");

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = streamUrl;
    video.play().catch(() => {});
    return;
  }

  try {
    await loadHlsLib();
  } catch (e) {
    showPlayerOverlay("تعذر تحميل المشغل");
    return;
  }

  if (!window.Hls || !window.Hls.isSupported()) {
    showPlayerOverlay("المتصفح لا يدعم البث");
    return;
  }

  if (hls) { hls.destroy(); hls = null; }
  hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 20,
    maxMaxBufferLength: 40,
    fragLoadingMaxRetry: 4,
    manifestLoadingMaxRetry: 4
  });
  hls.loadSource(streamUrl);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    video.play().catch(() => {});
    hidePlayerOverlay();
  });
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (!data.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      showPlayerOverlay("مشكلة شبكة... إعادة المحاولة");
      hls.startLoad();
    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      showPlayerOverlay("تصحيح الوسائط...");
      hls.recoverMediaError();
    } else if (retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(() => playStream(id, true), 1200);
    } else {
      showPlayerOverlay("تعذر تشغيل القناة");
    }
  });
}

// ========== MATCHES (ESPN) ==========
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LEAGUES = {
  "eng.1": "إنجلترا", "esp.1": "إسبانيا", "ita.1": "إيطاليا", "ger.1": "ألمانيا", "fra.1": "فرنسا",
  "uefa.champions": "دوري الأبطال", "uefa.europa": "الدوري الأوروبي", "caf.champions": "أبطال أفريقيا",
  "ksa.1": "الدوري السعودي", "alg.1": "الجزائر", "egy.1": "مصر", "mar.1": "المغرب", "tun.1": "تونس", "usa.1": "MLS"
};
let currentLeague = "eng.1", matchDay = new Date(), matchTimer = null;

const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");

function dayWord(d) {
  const diff = Math.round((new Date(iso(d)) - new Date(iso(new Date()))) / 86400000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "غداً";
  if (diff === -1) return "أمس";
  return d.toLocaleDateString("ar-EG", { weekday: "long" });
}

function paintDay() {
  $("dayName").textContent = dayWord(matchDay);
  $("dayDate").textContent = matchDay.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  $("datePicker").value = iso(matchDay);
}

function setupMatchesUI() {
  const bar = $("leaguesBar");
  bar.innerHTML = Object.keys(LEAGUES).map(id =>
    `<button class="lg-chip ${id === currentLeague ? "active" : ""}" data-id="${id}">${LEAGUES[id]}</button>`
  ).join("");
  bar.querySelectorAll(".lg-chip").forEach(chip => {
    chip.onclick = () => {
      currentLeague = chip.dataset.id;
      bar.querySelectorAll(".lg-chip").forEach(c => c.classList.toggle("active", c.dataset.id === currentLeague));
      loadMatches();
    };
  });
  $("prevDay").onclick = () => { matchDay.setDate(matchDay.getDate() - 1); loadMatches(); };
  $("nextDay").onclick = () => { matchDay.setDate(matchDay.getDate() + 1); loadMatches(); };
  $("datePicker").onchange = e => {
    if (!e.target.value) return;
    const [y, m, d] = e.target.value.split("-").map(Number);
    matchDay = new Date(y, m - 1, d);
    loadMatches();
  };
  paintDay();
}

async function loadMatches() {
  clearTimeout(matchTimer);
  paintDay();
  const list = $("matchesList");
  list.innerHTML = `<div id="loader"><div class="spinner"></div>جاري جلب المباريات...</div>`;
  try {
    const res = await fetch(`${ESPN}/${currentLeague}/scoreboard?dates=${ymd(matchDay)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderMatches(data.events || []);
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><svg class="icon" style="color:var(--warn)"><use href="#i-alert"></use></svg>فشل تحميل المباريات<br><small>تحقق من الاتصال ثم أعد المحاولة</small><br><button onclick="loadMatches()">إعادة المحاولة</button></div>`;
  }
}

function renderMatches(events) {
  const list = $("matchesList");
  if (!events.length) {
    list.innerHTML = `<div class="empty-state"><svg class="icon"><use href="#i-ball"></use></svg>لا توجد مباريات<br><small>جرب بطولة أخرى أو تاريخاً آخر</small></div>`;
    return;
  }
  let anyLive = false, lastGroup = "";
  let html = `<div class="league-box"><svg class="icon"><use href="#i-cup"></use></svg>${escapeHtml(LEAGUES[currentLeague] || "")}</div>`;

  events.forEach(ev => {
    const c = ev.competitions[0], st = ev.status.type;
    const home = c.competitors.find(x => x.homeAway === "home");
    const away = c.competitors.find(x => x.homeAway === "away");
    const running = st.state === "in";
    if (running) anyLive = true;

    const grp = c.notes && c.notes[0] ? c.notes[0].headline : "";
    if (grp && grp !== lastGroup) {
      html += `<div class="league-box"><svg class="icon"><use href="#i-cup"></use></svg>${escapeHtml(grp)}</div>`;
      lastGroup = grp;
    }

    let middle, label, labelCls = "m-time";
    if (st.state === "pre") {
      middle = `<div class="m-kick">${new Date(ev.date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</div>`;
      label = "لم تبدأ";
    } else {
      middle = `<div class="m-score">${home.score} - ${away.score}</div>`;
      if (running) {
        label = st.displayClock ? st.displayClock : "مباشر";
        labelCls = "m-time on";
      } else label = "انتهت";
    }
    const hLose = st.state === "post" && +home.score < +away.score ? " loser" : "";
    const aLose = st.state === "post" && +away.score < +home.score ? " loser" : "";

    html += `<div class="match-item${running ? " live" : ""}">
      <div class="m-team${hLose}"><img src="${home.team.logo || ""}" loading="lazy" onerror="this.style.display='none'"><span>${escapeHtml(home.team.shortDisplayName || home.team.displayName)}</span></div>
      <div>${middle}<div class="${labelCls}">${escapeHtml(label)}</div></div>
      <div class="m-team${aLose}"><img src="${away.team.logo || ""}" loading="lazy" onerror="this.style.display='none'"><span>${escapeHtml(away.team.shortDisplayName || away.team.displayName)}</span></div>
    </div>`;
  });

  list.innerHTML = html;
  if (anyLive && currentTab === "matches") matchTimer = setTimeout(loadMatches, 60000);
}

// ========== SEARCH ==========
function setupSearch() {
  let debounce;
  $("searchInput").oninput = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (currentTab === "channels") {
        filterAndRender();
        $("contentArea").scrollTop = 0;
      }
    }, 200);
  };
}

// ========== HELPERS ==========
function toggleLoader(show) {
  $("loader").classList.toggle("hidden", !show);
}

function escapeHtml(text) {
  if (text === 0) return "0";
  if (!text) return "";
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

// splash
setTimeout(() => {
  const s = $("splash");
  s.classList.add("hide");
  setTimeout(() => s.remove(), 450);
}, matchMedia("(prefers-reduced-motion: reduce)").matches ? 400 : 1400);

init();
