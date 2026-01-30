const $ = (id) => document.getElementById(id);

let WORDS = [];
let state = {
  mode: "list",
  dir: "en-ru",
  i: 0,
  showAnswer: false,
  audioCache: new Map(), // lookup -> url|null
};

function norm(s) {
  return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function reshuffleWords() {
  WORDS = shuffle(WORDS);
  state.i = 0;
  state.showAnswer = false;
  render();
}

function current() {
  return WORDS[state.i % WORDS.length];
}

function setTopStats() {
  $("count").textContent = WORDS.length;
  $("idx").textContent = WORDS.length ? (state.i + 1) : 0;
}

function next() {
  state.showAnswer = false;
  state.i = (state.i + 1) % WORDS.length;
  render();
}

/**
 * EN->RU: показываем произношение в подписи.
 * RU->EN: подпись пустая, чтобы не подсказывать.
 */
function promptText(w) {
  if (state.dir === "en-ru") return { prompt: w.en, sub: `произношение: ${w.pron}` };
  return { prompt: w.ru, sub: "" };
}

function answerText(w) {
  if (state.dir === "en-ru") {
    return `Русский: ${w.ru}\nПроизношение (кириллица): ${w.pron}`;
  } else {
    return `English: ${w.en}\nПроизношение (кириллица): ${w.pron}`;
  }
}

async function loadWords() {
  const rsp = await fetch("words.json", { cache: "no-store" });
  WORDS = await rsp.json();
  if (!Array.isArray(WORDS) || WORDS.length === 0) throw new Error("words.json пустой или неверный");

  WORDS = shuffle(WORDS);
  state.i = 0;
  setTopStats();
  render();
}

function render() {
  $("mode").value = state.mode;
  $("dir").value = state.dir;

  const screen = $("screen");
  screen.innerHTML = "";

  setTopStats();

  if (state.mode === "list") renderList(screen);
  if (state.mode === "cards") renderCards(screen);
  if (state.mode === "mcq") renderMCQ(screen);
  if (state.mode === "dict") renderDictation(screen);

  bindHotkeys();
}

function renderList(root) {
  const box = document.createElement("div");
  box.className = "card";
  box.style.padding = "0";
  box.innerHTML = `
    <div style="padding:14px">
      <div class="row" style="align-items:flex-end">
        <div class="grow">
          <label>Поиск</label>
          <input id="q" placeholder="например: sensor / датчик" />
          <div class="hint">В списке можно нажимать 🔊 для аудио.</div>
        </div>
        <div style="flex:0 0 180px">
          <button class="ghost" id="mix">🔀 Перемешать</button>
        </div>
      </div>
    </div>
    <div class="hr"></div>
    <div style="padding:0 14px 14px 14px; overflow:auto">
      <table>
        <thead>
          <tr>
            <th>English</th><th>Русский</th><th>Произн.</th><th>Аудио</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>
  `;
  root.appendChild(box);

  box.querySelector("#mix").onclick = () => reshuffleWords();
  const tbody = box.querySelector("#tbody");

  function draw(filter = "") {
    tbody.innerHTML = "";
    const f = norm(filter);

    for (const w of WORDS) {
      const hit =
        !f ||
        norm(w.en).includes(f) ||
        norm(w.lookup).includes(f) ||
        norm(w.ru).includes(f);

      if (!hit) continue;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${escapeHtml(w.en)}</td>
        <td>${escapeHtml(w.ru)}</td>
        <td>${escapeHtml(w.pron || "")}</td>
        <td><button class="ghost" data-audio="${escapeHtml(w.lookup)}">🔊</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-audio]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await playAudio(btn.getAttribute("data-audio"), btn);
      });
    });
  }

  const q = box.querySelector("#q");
  q.addEventListener("input", () => draw(q.value));
  draw("");
}

function renderCards(root) {
  const w = current();
  const { prompt, sub } = promptText(w);

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="big">${escapeHtml(prompt)}</div>
    <p class="sub">${escapeHtml(sub)}</p>

    <div class="hr"></div>

    <div class="row">
      <button class="primary" id="flip">Показать ответ (<span class="kbd">Space</span>)</button>
      <button class="ghost" id="audio">🔊 Аудио</button>
      <button class="ghost" id="mix">🔀 Перемешать</button>
      <button class="ghost" id="n">Следующее (<span class="kbd">N</span>)</button>
    </div>

    <div class="hr"></div>

    <div id="ans" class="ans" style="display:${state.showAnswer ? "block" : "none"}; white-space:pre-line"></div>
  `;
  root.appendChild(wrap);

  const ans = wrap.querySelector("#ans");
  ans.textContent = answerText(w);

  wrap.querySelector("#flip").onclick = () => { state.showAnswer = !state.showAnswer; render(); };
  wrap.querySelector("#n").onclick = () => next();
  wrap.querySelector("#mix").onclick = () => reshuffleWords();
  wrap.querySelector("#audio").onclick = async () => playAudio(w.lookup, wrap.querySelector("#audio"));
}

function renderMCQ(root) {
  const w = current();
  const { prompt, sub } = promptText(w);

  const choices = buildChoices(w, 4);
  const correctVal = state.dir === "en-ru" ? w.ru : w.en;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="big">${escapeHtml(prompt)}</div>
    <p class="sub">${escapeHtml(sub)}</p>

    <div class="hr"></div>

    <div class="row">
      <button class="ghost" id="audio">🔊 Аудио</button>
      <button class="ghost" id="mix">🔀 Перемешать</button>
      <button class="ghost" id="n">Следующее (<span class="kbd">N</span>)</button>
    </div>

    <div class="hr"></div>
    <div class="opts" id="opts"></div>

    <div class="hr"></div>
    <div id="ans" class="ans" style="display:none; white-space:pre-line"></div>
  `;
  root.appendChild(wrap);

  wrap.querySelector("#mix").onclick = () => reshuffleWords();
  wrap.querySelector("#n").onclick = () => next();
  wrap.querySelector("#audio").onclick = async () => playAudio(w.lookup, wrap.querySelector("#audio"));

  const opts = wrap.querySelector("#opts");
  const ans = wrap.querySelector("#ans");

  for (const c of choices) {
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = c;
    btn.onclick = () => {
      const ok = norm(c) === norm(correctVal);
      ans.style.display = "block";
      ans.textContent = (ok ? "✅ Верно\n\n" : "❌ Неверно\n\n") + answerText(w);
    };
    opts.appendChild(btn);
  }
}

function renderDictation(root) {
  const w = current();

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="big">🔊 Слушай и введи слово</div>
    <p class="sub">Подсказка (рус.): ${escapeHtml(w.ru)} • (Space — повторить аудио)</p>

    <div class="hr"></div>

    <div class="row">
      <button class="primary" id="play">▶️ Проиграть аудио</button>
      <button class="ghost" id="mix">🔀 Перемешать</button>
      <button class="ghost" id="show">Показать ответ</button>
      <button class="ghost" id="n">Следующее (<span class="kbd">N</span>)</button>
    </div>

    <div class="hr"></div>

    <label>Ваш ответ (English)</label>
    <input id="inp" placeholder="введите услышанное слово и Enter" />

    <div class="hr"></div>
    <div id="ans" class="ans" style="display:none; white-space:pre-line"></div>
  `;
  root.appendChild(wrap);

  wrap.querySelector("#mix").onclick = () => reshuffleWords();
  wrap.querySelector("#n").onclick = () => next();

  const inp = wrap.querySelector("#inp");
  const ans = wrap.querySelector("#ans");

  const accepted = new Set([norm(w.en), norm(w.lookup)]);

  function showResult(ok) {
    ans.style.display = "block";
    ans.textContent = (ok ? "✅ Верно\n\n" : "❌ Неверно\n\n") + answerText(w);
  }

  function check() {
    const v = norm(inp.value);
    showResult(accepted.has(v));
  }

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") check();
  });

  wrap.querySelector("#play").onclick = async () => playAudio(w.lookup, wrap.querySelector("#play"));
  wrap.querySelector("#show").onclick = () => { ans.style.display = "block"; ans.textContent = answerText(w); };
}

function buildChoices(w, n = 4) {
  const pool = WORDS.filter((x) => x !== w);
  const pick = shuffle(pool).slice(0, n - 1);
  const correct = state.dir === "en-ru" ? w.ru : w.en;
  const arr = [...pick.map((x) => (state.dir === "en-ru" ? x.ru : x.en)), correct];
  return shuffle(arr);
}

/**
 * Аудио:
 * 1) en.wiktionary.org REST: /page/media-list/{word}
 * 2) commons.wikimedia.org API: imageinfo -> direct url
 */
async function getAudioUrl(lookup) {
  const key = norm(lookup);
  if (state.audioCache.has(key)) return state.audioCache.get(key);

  const mediaUrl = `https://en.wiktionary.org/api/rest_v1/page/media-list/${encodeURIComponent(lookup)}`;
  let data;
  try {
    const rsp = await fetch(mediaUrl, { cache: "no-store" });
    if (!rsp.ok) throw new Error();
    data = await rsp.json();
  } catch {
    state.audioCache.set(key, null);
    return null;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const prefer = ["en-us", "en-uk", "en-ca", "eng"];
  let fileTitle = null;

  for (const tag of prefer) {
    const found = items.find((it) => {
      const t = (it?.title || "").toLowerCase();
      const looksAudio = t.includes(".ogg") || t.includes(".oga") || t.includes(".wav") || t.includes(".mp3");
      return looksAudio && t.includes(tag);
    });
    if (found?.title) { fileTitle = found.title; break; }
  }

  if (!fileTitle) {
    const found = items.find((it) => {
      const t = (it?.title || "").toLowerCase();
      return t.includes(".ogg") || t.includes(".oga") || t.includes(".wav") || t.includes(".mp3");
    });
    if (found?.title) fileTitle = found.title;
  }

  if (!fileTitle) {
    state.audioCache.set(key, null);
    return null;
  }

  if (!fileTitle.toLowerCase().startsWith("file:")) fileTitle = "File:" + fileTitle;

  const commons = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(fileTitle)}`;

  try {
    const rsp = await fetch(commons, { cache: "no-store" });
    if (!rsp.ok) throw new Error();
    const j = await rsp.json();
    const pages = j?.query?.pages || {};
    const page = Object.values(pages)[0];
    const url = page?.imageinfo?.[0]?.url || null;
    state.audioCache.set(key, url);
    return url;
  } catch {
    state.audioCache.set(key, null);
    return null;
  }
}

async function playAudio(lookup, btn) {
  const old = btn?.textContent;
  if (btn) { btn.textContent = "⏳"; btn.disabled = true; }

  const url = await getAudioUrl(lookup);

  if (btn) { btn.textContent = old; btn.disabled = false; }

  if (!url) {
    alert(`Аудио не найдено для: ${lookup}`);
    return;
  }

  try {
    const a = new Audio(url);
    a.play();
  } catch {
    window.open(url, "_blank");
  }
}

function bindHotkeys() {
  document.onkeydown = async (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;

    if (e.key === "n" || e.key === "N") next();

    if (e.code === "Space") {
      e.preventDefault();
      const w = current();
      if (state.mode === "cards") {
        state.showAnswer = !state.showAnswer;
        render();
      } else if (state.mode === "dict") {
        await playAudio(w.lookup, null);
      }
    }
  };
}

function escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("mode").addEventListener("change", (e) => { state.mode = e.target.value; render(); });
$("dir").addEventListener("change", (e) => { state.dir = e.target.value; render(); });

loadWords().catch((err) => {
  $("screen").innerHTML = `<div class="ans">Ошибка загрузки: ${escapeHtml(err.message)}</div>`;
});

