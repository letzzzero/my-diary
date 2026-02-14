const $ = (id) => document.getElementById(id);

const dateInput = $("date");
const titleInput = $("title");
const moodSelect = $("mood");
const content = $("content");
const status = $("status");

const entriesBox = $("entries");

const metricName = $("metricName");
const metricUnit = $("metricUnit");
const addMetricBtn = $("addMetric");
const metricsBox = $("metrics");
const presetChips = $("presetChips");

const goalText = $("goalText");
const goalTarget = $("goalTarget");
const goalUnit = $("goalUnit");
const addGoalBtn = $("addGoal");
const goalsBox = $("goals");

const themeToggle = $("themeToggle");
if (themeToggle) themeToggle.onclick = () => window.__toggleTheme?.();

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fmtMood(m) {
  const map = { 1: "😣", 2: "😕", 3: "😐", 4: "🙂", 5: "😄" };
  return map[m] || "•";
}

function setStatus(text, kind = "muted") {
  status.className = kind === "ok" ? "muted ok" : kind === "err" ? "muted err" : "muted";
  status.textContent = text;
}

async function loadEntry(date) {
  setStatus("Загрузка…");
  const res = await fetch(`/api/entry?date=${encodeURIComponent(date)}`);
  const data = await res.json();

  const e = data.entry || {};
  titleInput.value = e.title || "";
  moodSelect.value = e.mood ?? "";
  content.value = e.content || "";

  setStatus(`Открыто: ${date}`, "ok");
}

async function saveEntry() {
  const date = dateInput.value;
  setStatus("Сохранение…");

  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date,
      title: titleInput.value,
      mood: moodSelect.value || null,
      content: content.value,
    }),
  });

  if (!res.ok) return setStatus("Ошибка сохранения", "err");

  setStatus("Сохранено ✅", "ok");
  await refreshEntries();
}

async function refreshEntries() {
  const res = await fetch("/api/entries");
  const data = await res.json();

  entriesBox.innerHTML = "";
  for (const e of data.entries || []) {
    const btn = document.createElement("button");
    btn.className = "entry";
    btn.innerHTML = `
      <div class="entry-top">
        <div class="entry-date">${escapeHtml(e.entry_date)}</div>
        <div class="entry-mood">${fmtMood(e.mood)}</div>
      </div>
      <div class="entry-title">${escapeHtml(e.title || "Без названия")}</div>
      <div class="entry-preview muted">${escapeHtml(e.preview || "")}</div>
    `;
    btn.onclick = async () => {
      dateInput.value = e.entry_date;
      await loadAllForDate();
    };
    entriesBox.appendChild(btn);
  }
}

const PRESETS = [
  { name: "Отжимания", unit: "раз", delta: 5 },
  { name: "Пресс", unit: "раз", delta: 10 },
  { name: "Приседания", unit: "раз", delta: 10 },
  { name: "Чтение", unit: "мин", delta: 10 },
  { name: "Вода", unit: "стакан", delta: 1 },
];

function renderPresets() {
  presetChips.innerHTML = "";
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = `${p.name} +${p.delta}`;
    b.onclick = async () => {
      await upsertMetric(p.name, p.delta, p.unit);
      await refreshMetrics();
    };
    presetChips.appendChild(b);
  }
}

async function fetchMetrics(date) {
  const res = await fetch(`/api/metrics?date=${encodeURIComponent(date)}`);
  const data = await res.json();
  return data.metrics || [];
}

async function upsertMetric(name, delta, unit) {
  await fetch("/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateInput.value, name, delta, unit }),
  });
}

async function setMetricValue(name, value, unit) {
  await fetch("/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateInput.value, name, value, unit }),
  });
}

async function deleteMetric(name) {
  await fetch("/api/metrics", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateInput.value, name }),
  });
}

function metricRow(m) {
  const div = document.createElement("div");
  div.className = "metric";

  const unit = m.unit ? ` ${escapeHtml(m.unit)}` : "";

  div.innerHTML = `
    <div class="metric-main">
      <div class="metric-name">${escapeHtml(m.name)}</div>
      <div class="metric-value"><span class="num">${m.value}</span><span class="unit">${unit}</span></div>
    </div>

    <div class="metric-actions">
      <button class="btn mini ghost" data-act="minus">−</button>
      <button class="btn mini ghost" data-act="plus">+</button>
      <button class="btn mini ghost" data-act="plus5">+5</button>
      <input class="metric-input" type="number" step="1" value="${m.value}" />
      <button class="btn mini danger" data-act="del">✕</button>
    </div>
  `;

  const input = div.querySelector(".metric-input");
  div.querySelector('[data-act="minus"]').onclick = async () => {
    await upsertMetric(m.name, -1, m.unit);
    await refreshMetrics();
  };
  div.querySelector('[data-act="plus"]').onclick = async () => {
    await upsertMetric(m.name, +1, m.unit);
    await refreshMetrics();
  };
  div.querySelector('[data-act="plus5"]').onclick = async () => {
    await upsertMetric(m.name, +5, m.unit);
    await refreshMetrics();
  };
  input.onchange = async () => {
    const v = Number(input.value || 0);
    await setMetricValue(m.name, v, m.unit);
    await refreshMetrics();
  };
  div.querySelector('[data-act="del"]').onclick = async () => {
    if (!confirm("Удалить метрику?")) return;
    await deleteMetric(m.name);
    await refreshMetrics();
  };

  return div;
}

async function refreshMetrics() {
  const ms = await fetchMetrics(dateInput.value);
  metricsBox.innerHTML = "";

  if (ms.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `
      <div class="muted">Пока нет метрик на эту дату.</div>
      <div class="muted">Используй кнопки сверху или добавь свою.</div>
    `;
    metricsBox.appendChild(empty);
    return;
  }

  for (const m of ms) metricsBox.appendChild(metricRow(m));
}

// Goals
async function fetchGoals() {
  const res = await fetch("/api/goals");
  const data = await res.json();
  return data.goals || [];
}

async function addGoal() {
  const title = goalText.value.trim();
  if (!title) return;

  const target = Number(goalTarget.value || 1);
  const unit = goalUnit.value.trim();

  const res = await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, target, unit }),
  });

  if (!res.ok) return;

  goalText.value = "";
  goalTarget.value = "";
  goalUnit.value = "";
  await refreshGoals();
}

async function patchGoal(id, body) {
  await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function goalRow(g) {
  const div = document.createElement("div");
  div.className = g.done ? "goal done" : "goal";

  const current = Number(g.current || 0);
  const target = Number(g.target || 1);
  const unit = g.unit ? ` ${escapeHtml(g.unit)}` : "";
  const pct = Math.round((current / target) * 100);
  const safePct = Math.max(0, Math.min(100, pct));

  div.innerHTML = `
    <div class="goal-top">
      <div class="goal-title">${escapeHtml(g.title)}</div>
      <div class="goal-meta">${current} / ${target}${unit}</div>
    </div>

    <div class="bar" aria-label="progress">
      <div class="bar-fill" style="width:${safePct}%"></div>
    </div>

    <div class="goal-actions">
      <button class="btn mini ghost" data-act="m1">−1</button>
      <button class="btn mini ghost" data-act="p1">+1</button>
      <button class="btn mini ghost" data-act="p5">+5</button>
      <input class="goal-input" type="number" step="1" value="${current}" />
      <button class="btn mini ${g.done ? "ghost" : "primary"}" data-act="done">
        ${g.done ? "Готово ✓" : "Отметить готово"}
      </button>
    </div>
  `;

  const input = div.querySelector(".goal-input");
  div.querySelector('[data-act="m1"]').onclick = async () => {
    await patchGoal(g.id, { currentDelta: -1 });
    await refreshGoals();
  };
  div.querySelector('[data-act="p1"]').onclick = async () => {
    await patchGoal(g.id, { currentDelta: +1 });
    await refreshGoals();
  };
  div.querySelector('[data-act="p5"]').onclick = async () => {
    await patchGoal(g.id, { currentDelta: +5 });
    await refreshGoals();
  };
  input.onchange = async () => {
    const v = Number(input.value || 0);
    await patchGoal(g.id, { current: v });
    await refreshGoals();
  };
  div.querySelector('[data-act="done"]').onclick = async () => {
    await patchGoal(g.id, { done: g.done ? 0 : 1 });
    await refreshGoals();
  };

  return div;
}

async function refreshGoals() {
  const goals = await fetchGoals();
  goalsBox.innerHTML = "";

  if (goals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<div class="muted">Пока нет целей. Добавь первую — и веди прогресс.</div>`;
    goalsBox.appendChild(empty);
    return;
  }

  for (const g of goals) goalsBox.appendChild(goalRow(g));
}

async function loadAllForDate() {
  await loadEntry(dateInput.value);
  await refreshMetrics();
}

// wire
$("load").onclick = loadAllForDate;
$("save").onclick = saveEntry;
addMetricBtn.onclick = async () => {
  const name = metricName.value.trim();
  if (!name) return;

  const unit = metricUnit.value.trim();
  await setMetricValue(name, 0, unit || null);

  metricName.value = "";
  metricUnit.value = "";
  await refreshMetrics();
};

addGoalBtn.onclick = addGoal;

dateInput.onchange = loadAllForDate;

// init
renderPresets();
dateInput.value = todayISO();
loadAllForDate();
refreshEntries();
refreshGoals();
