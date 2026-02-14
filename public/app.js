const $ = (id) => document.getElementById(id);

const dateInput = $("date");
const content = $("content");
const status = $("status");
const entriesList = $("entries");

const goalText = $("goalText");
const addGoalBtn = $("addGoal");
const goalsList = $("goals");

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

async function loadEntry(date) {
  status.textContent = "Загрузка...";
  const res = await fetch(`/api/entry?date=${encodeURIComponent(date)}`);
  const data = await res.json();
  content.value = data.entry?.content ?? "";
  status.textContent = `Открыто: ${date}`;
}

async function saveEntry(date, text) {
  status.textContent = "Сохранение...";
  const res = await fetch("/api/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, content: text }),
  });
  if (!res.ok) {
    status.textContent = "Ошибка сохранения";
    return;
  }
  status.textContent = "Сохранено ✅";
  await refreshEntries();
}

async function refreshEntries() {
  const res = await fetch("/api/entries");
  const data = await res.json();

  entriesList.innerHTML = "";
  for (const e of data.entries || []) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <button class="small" data-date="${e.entry_date}">
        <b>${e.entry_date}</b>
        <div class="muted">${escapeHtml(e.preview || "")}</div>
      </button>
    `;
    entriesList.appendChild(li);
  }

  entriesList.querySelectorAll("button[data-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.getAttribute("data-date");
      dateInput.value = date;
      loadEntry(date);
    });
  });
}

async function refreshGoals() {
  const res = await fetch("/api/goals");
  const data = await res.json();

  goalsList.innerHTML = "";
  for (const g of data.goals || []) {
    const li = document.createElement("li");
    li.className = "item row";
    li.innerHTML = `
      <label class="row" style="gap:10px; align-items:center;">
        <input type="checkbox" ${g.done ? "checked" : ""} data-id="${g.id}" />
        <span class="${g.done ? "done" : ""}">${escapeHtml(g.title)}</span>
      </label>
    `;
    goalsList.appendChild(li);
  }

  goalsList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const id = cb.getAttribute("data-id");
      await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: cb.checked }),
      });
      refreshGoals();
    });
  });
}

$("load").onclick = () => loadEntry(dateInput.value);
$("save").onclick = () => saveEntry(dateInput.value, content.value);

addGoalBtn.onclick = async () => {
  const title = goalText.value.trim();
  if (!title) return;
  await fetch("/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  goalText.value = "";
  refreshGoals();
};

// init
dateInput.value = todayISO();
loadEntry(dateInput.value);
refreshEntries();
refreshGoals();
