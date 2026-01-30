// ====== СЛОВА (ваш список) ======
const VOCAB = [
  { en: "Embedded", ru: "встроенный (встраиваемый)", pron: "эмбэ́дид" },
  { en: "sensor", ru: "датчик", pron: "се́нсор" },
  { en: "actuator", ru: "исполнительный механизм (привод)", pron: "э́ктьюэ́йтор" },
  { en: "software", ru: "программное обеспечение", pron: "со́фтвэа" },
  { en: "storage", ru: "хранилище / накопитель", pron: "сто́ридж" },
  { en: "hardware", ru: "аппаратное обеспечение / железо", pron: "ха́рдвэа" },
  { en: "semiconductor", ru: "полупроводник", pron: "сэ́микэнда́ктор" },
  { en: "measures", ru: "измеряет / измерения", pron: "ме́жэрз" },
  { en: "transfers", ru: "передаёт / передачи", pron: "трэ́нсфэрз" },
  { en: "states", ru: "состояния", pron: "стэ́йтс" },
  { en: "button", ru: "кнопка", pron: "ба́тн" },
  { en: "trigger", ru: "триггер; запускать/срабатывать", pron: "три́гэр" },
  { en: "receive", ru: "получать / принимать", pron: "рисíв" },
  { en: "LED", ru: "светодиод", pron: "эл-и-ди́" },
  { en: "trying", ru: "пытаться / попытка", pron: "тра́йинг" },
  { en: "view", ru: "вид; просмотр", pron: "вью" },
  { en: "varies", ru: "варьируется / меняется", pron: "вэ́эриз" },
  { en: "continuously", ru: "непрерывно", pron: "кэнти́ньюэсли" },
  { en: "safe", ru: "безопасный", pron: "сэйф" },
  { en: "frequency", ru: "частота", pron: "фри́квэнси" },
  { en: "settings", ru: "настройки", pron: "сэ́тингз" },
  { en: "repeats", ru: "повторяет(ся)", pron: "рипи́тс" },
  { en: "secure", ru: "защищённый / обезопасить", pron: "сикью́р" },
  { en: "acquire", ru: "получать (данные), захватывать", pron: "эква́йэр" }
];

// ====== УТИЛИТЫ ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sample(arr, n) { return shuffle(arr).slice(0, n); }

let deck = shuffle(VOCAB);
let currentTab = "cards";

// ====== AUDIO: Wiktionary/Commons через MediaWiki API + fallback SpeechSynthesis ======
const audioCache = new Map(); // word -> url|null

async function getWiktionaryAudioURL(word) {
  if (audioCache.has(word)) return audioCache.get(word);

  // 1) Получаем список файлов (images) со страницы слова
  const pageUrl = new URL("https://en.wiktionary.org/w/api.php");
  pageUrl.search = new URLSearchParams({
    action: "query",
    prop: "images",
    titles: word,
    format: "json",
    origin: "*"
  });

  const pageJson = await fetch(pageUrl).then(r => r.json());
  const pages = pageJson?.query?.pages;
  const pageId = pages ? Object.keys(pages)[0] : null;
  const images = pageId ? (pages[pageId].images || []) : [];

  // Ищем типичные файлы произношения (варианты встречаются разные):
  // File:en-us-word.ogg, File:En-us-word.ogg, иногда mp3/wav
  const file = images
    .map(x => x.title)
    .find(t =>
      /^File:(en|En)-us-.*\.(ogg|mp3|wav)$/i.test(t) ||
      /^File:LL-Q1860.*\.(ogg|mp3|wav)$/i.test(t) ||
      /^File:En-.*\.(ogg|mp3|wav)$/i.test(t)
    );

  if (!file) {
    audioCache.set(word, null);
    return null;
  }

  // 2) Получаем прямой URL файла через imageinfo
  const fileUrl = new URL("https://en.wiktionary.org/w/api.php");
  fileUrl.search = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    titles: file,
    iiprop: "url",
    format: "json",
    origin: "*"
  });

  const fileJson = await fetch(fileUrl).then(r => r.json());
  const fp = fileJson?.query?.pages;
  const fid = fp ? Object.keys(fp)[0] : null;
  const url = fid ? (fp[fid]?.imageinfo?.[0]?.url ?? null) : null;

  audioCache.set(word, url);
  return url;
}

async function speakWord(word) {
  // Пытаемся сыграть реальный аудиофайл
  try {
    const url = await getWiktionaryAudioURL(word);
    if (url) {
      const audio = new Audio(url);
      audio.play();
      setStatus(`Озвучка: Wiktionary`);
      return;
    }
  } catch (e) {
    // тихо падаем на fallback
  }

  // Fallback: голос браузера (TTS)
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  setStatus(`Озвучка: голос браузера`);
}

function setStatus(text) {
  $("#status").textContent = text || "";
  if (text) setTimeout(() => { $("#status").textContent = ""; }, 2000);
}

// ====== ТАБЫ ======
$$(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    currentTab = tab;

    $$(".panel").forEach(p => p.classList.remove("active"));
    $("#" + tab).classList.add("active");

    // при смене вкладки — обновляем контент
    renderAll();
  });
});

// ====== ПЕРЕМЕШАТЬ ======
$("#btnShuffle").addEventListener("click", () => {
  deck = shuffle(deck);
  resetMcq();
  resetTyping();
  resetMatch();
  setStatus("Перемешано");
  renderAll();
});

// ====== 1) КАРТОЧКИ ======
let cardI = 0;
$("#btnPrev").addEventListener("click", () => { cardI = (cardI - 1 + deck.length) % deck.length; hideReveal(); renderCards(); });
$("#btnNext").addEventListener("click", () => { cardI = (cardI + 1) % deck.length; hideReveal(); renderCards(); });
$("#btnReveal").addEventListener("click", () => {
  $("#cardTranslation").classList.toggle("hidden");
});
$("#btnSpeakCard").addEventListener("click", async () => {
  await speakWord(deck[cardI].en);
});

function hideReveal() { $("#cardTranslation").classList.add("hidden"); }

function renderCards() {
  const w = deck[cardI];
  $("#cardWord").textContent = w.en;
  $("#cardPron").textContent = w.pron ? `Произношение (кириллицей): ${w.pron}` : "";
  $("#cardTranslation").textContent = w.ru;
  $("#cardIndex").textContent = `${cardI + 1} / ${deck.length}`;
}

// ====== 2) MCQ ======
let mcqI = 0;
let mcqAnswered = false;

$("#btnSpeakMcq").addEventListener("click", async () => speakWord(deck[mcqI].en));
$("#btnMcqNext").addEventListener("click", () => {
  mcqI = (mcqI + 1) % deck.length;
  mcqAnswered = false;
  renderMcq();
});

function resetMcq() { mcqI = 0; mcqAnswered = false; }

function renderMcq() {
  const w = deck[mcqI];
  $("#mcqWord").textContent = w.en;
  $("#mcqPron").textContent = w.pron ? `Произношение: ${w.pron}` : "";
  $("#mcqIndex").textContent = `${mcqI + 1} / ${deck.length}`;
  $("#mcqFeedback").textContent = "";
  $("#mcqFeedback").className = "feedback";

  const wrong = deck.filter(x => x.en !== w.en);
  const opts = shuffle([w, ...sample(wrong, 3)]).map(x => x.ru);

  $("#mcqOptions").innerHTML = "";
  opts.forEach(text => {
    const b = document.createElement("button");
    b.textContent = text;
    b.addEventListener("click", () => {
      if (mcqAnswered) return;
      mcqAnswered = true;

      if (text === w.ru) {
        $("#mcqFeedback").textContent = "Верно";
        $("#mcqFeedback").classList.add("ok");
      } else {
        $("#mcqFeedback").textContent = `Неверно. Правильно: ${w.ru}`;
        $("#mcqFeedback").classList.add("bad");
      }
    });
    $("#mcqOptions").appendChild(b);
  });
}

// ====== 3) TYPING ======
let typeI = 0;
$("#btnSpeakType").addEventListener("click", async () => speakWord(deck[typeI].en));
$("#btnTypeNext").addEventListener("click", () => {
  typeI = (typeI + 1) % deck.length;
  $("#typeInput").value = "";
  $("#typeFeedback").textContent = "";
  $("#typeFeedback").className = "feedback";
  renderTyping();
});
$("#btnCheckType").addEventListener("click", checkTyping);
$("#typeInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkTyping();
});

function resetTyping() { typeI = 0; }

function renderTyping() {
  const w = deck[typeI];
  $("#typePrompt").textContent = w.ru;
  $("#typeIndex").textContent = `${typeI + 1} / ${deck.length}`;
}

function checkTyping() {
  const w = deck[typeI];
  const v = ($("#typeInput").value || "").trim();

  $("#typeFeedback").className = "feedback";
  if (v.toLowerCase() === w.en.toLowerCase()) {
    $("#typeFeedback").textContent = "Верно";
    $("#typeFeedback").classList.add("ok");
  } else {
    $("#typeFeedback").textContent = `Неверно. Правильно: ${w.en}`;
    $("#typeFeedback").classList.add("bad");
  }
}

// ====== 4) MATCHING ======
let matchPairs = new Map(); // en -> ru
let matchLeftSelected = null;
let matchRightSelected = null;
let matchLeftOrder = [];
let matchRightOrder = [];

$("#btnResetMatch").addEventListener("click", () => {
  resetMatch();
  renderMatch();
});

function resetMatch() {
  matchPairs = new Map();
  matchLeftSelected = null;
  matchRightSelected = null;
  matchLeftOrder = shuffle(deck);
  matchRightOrder = shuffle(deck);
}

function renderMatch() {
  $("#matchFeedback").textContent = "";
  $("#matchFeedback").className = "feedback";

  const doneCount = matchPairs.size;
  $("#matchProgress").textContent = `Собрано пар: ${doneCount} / ${deck.length}`;

  $("#matchLeft").innerHTML = "";
  $("#matchRight").innerHTML = "";

  matchLeftOrder.forEach(w => {
    const div = document.createElement("div");
    div.className = "item";
    div.dataset.en = w.en;

    const already = matchPairs.has(w.en);
    if (already) div.classList.add("done");
    if (matchLeftSelected === w.en) div.classList.add("selected");

    div.innerHTML = `<span>${w.en}</span><span class="badge">🔊</span>`;
    div.addEventListener("click", async () => {
      if (matchPairs.has(w.en)) return;
      matchLeftSelected = w.en;
      matchRightSelected = null;
      renderMatch();
      await speakWord(w.en);
    });

    $("#matchLeft").appendChild(div);
  });

  matchRightOrder.forEach(w => {
    const div = document.createElement("div");
    div.className = "item";
    div.dataset.ru = w.ru;

    const already = Array.from(matchPairs.values()).includes(w.ru);
    if (already) div.classList.add("done");
    if (matchRightSelected === w.ru) div.classList.add("selected");

    div.innerHTML = `<span>${w.ru}</span>`;
    div.addEventListener("click", () => {
      if (already) return;
      matchRightSelected = w.ru;
      tryPair();
    });

    $("#matchRight").appendChild(div);
  });
}

function tryPair() {
  if (!matchLeftSelected || !matchRightSelected) {
    renderMatch();
    return;
  }

  const correct = deck.find(w => w.en === matchLeftSelected)?.ru === matchRightSelected;

  if (correct) {
    matchPairs.set(matchLeftSelected, matchRightSelected);
    $("#matchFeedback").textContent = "Верно";
    $("#matchFeedback").className = "feedback ok";
  } else {
    $("#matchFeedback").textContent = "Неверно";
    $("#matchFeedback").className = "feedback bad";
  }

  matchLeftSelected = null;
  matchRightSelected = null;

  if (matchPairs.size === deck.length) {
    $("#matchFeedback").textContent = "Готово: все пары собраны";
    $("#matchFeedback").className = "feedback ok";
  }

  renderMatch();
}

// ====== РЕНДЕР ВСЕГО ======
function renderAll() {
  renderCards();
  renderMcq();
  renderTyping();
  renderMatch();
}

// ====== INIT ======
resetMatch();
renderAll();
