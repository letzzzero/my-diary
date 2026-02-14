require("dotenv").config();
const path = require("path");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { initDb, getDb } = require("./db");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.sqlite", dir: "./" }),
    secret: process.env.SESSION_SECRET || "devsecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // secure: true, // включают только если HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session?.auth) return next();
  return res.redirect("/login");
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Pages
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const ok =
    username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS;

  if (!ok) return res.status(401).render("login", { error: "Неверные данные" });

  req.session.auth = true;
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/", requireAuth, (req, res) => {
  res.render("index");
});

// ---------- API: Entries ----------
app.get("/api/entry", requireAuth, async (req, res) => {
  const date = String(req.query.date || "");
  if (!date) return res.status(400).json({ error: "date required" });

  const db = getDb();
  const row = await db.get("select * from entries where entry_date = ?", date);
  res.json({
    entry: row || { entry_date: date, title: "", mood: null, content: "" },
  });
});

app.post("/api/entry", requireAuth, async (req, res) => {
  const { date, title, mood, content } = req.body || {};
  if (!date) return res.status(400).json({ error: "date required" });

  const moodVal =
    mood === null || mood === undefined || mood === ""
      ? null
      : clamp(Number(mood), 1, 5);

  const db = getDb();
  await db.run(
    `
    insert into entries(entry_date, title, mood, content, updated_at)
    values(?, ?, ?, ?, datetime('now'))
    on conflict(entry_date) do update set
      title=excluded.title,
      mood=excluded.mood,
      content=excluded.content,
      updated_at=datetime('now')
    `,
    date,
    String(title || ""),
    moodVal,
    String(content || "")
  );

  res.json({ ok: true });
});

app.get("/api/entries", requireAuth, async (req, res) => {
  const db = getDb();
  const rows = await db.all(
    `
    select entry_date, title, mood,
           substr(content, 1, 140) as preview,
           updated_at
    from entries
    order by entry_date desc
    limit 40
    `
  );
  res.json({ entries: rows });
});

// ---------- API: Goals ----------
app.get("/api/goals", requireAuth, async (req, res) => {
  const db = getDb();
  const rows = await db.all("select * from goals order by done asc, id desc");
  res.json({ goals: rows });
});

app.post("/api/goals", requireAuth, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const target = Number(req.body?.target || 1);
  const unit = String(req.body?.unit || "").trim();

  if (!title) return res.status(400).json({ error: "title required" });

  const db = getDb();
  const result = await db.run(
    "insert into goals(title, done, current, target, unit) values(?, 0, 0, ?, ?)",
    title,
    isFinite(target) && target > 0 ? target : 1,
    unit || null
  );
  const goal = await db.get("select * from goals where id = ?", result.lastID);
  res.status(201).json({ goal });
});

app.patch("/api/goals/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();

  const body = req.body || {};
  const goal = await db.get("select * from goals where id = ?", id);
  if (!goal) return res.status(404).json({ error: "not found" });

  let current = Number(goal.current || 0);
  let target = Number(goal.target || 1);
  let done = Number(goal.done || 0);
  let unit = goal.unit || null;

  if (body.currentDelta !== undefined) current += Number(body.currentDelta || 0);
  if (body.current !== undefined) current = Number(body.current || 0);
  if (body.target !== undefined) target = Number(body.target || 1);
  if (body.unit !== undefined) unit = String(body.unit || "").trim() || null;
  if (body.done !== undefined) done = body.done ? 1 : 0;

  current = isFinite(current) ? Math.max(0, current) : 0;
  target = isFinite(target) && target > 0 ? target : 1;

  // auto-done if reached target
  if (current >= target) done = 1;

  await db.run(
    "update goals set current = ?, target = ?, unit = ?, done = ? where id = ?",
    current,
    target,
    unit,
    done,
    id
  );

  const updated = await db.get("select * from goals where id = ?", id);
  res.json({ goal: updated });
});

// ---------- API: Metrics ----------
app.get("/api/metrics", requireAuth, async (req, res) => {
  const date = String(req.query.date || "");
  if (!date) return res.status(400).json({ error: "date required" });

  const db = getDb();
  const rows = await db.all(
    "select * from metrics where metric_date = ? order by name asc",
    date
  );
  res.json({ metrics: rows });
});

app.post("/api/metrics", requireAuth, async (req, res) => {
  const { date, name, delta, value, unit } = req.body || {};
  if (!date) return res.status(400).json({ error: "date required" });

  const nm = String(name || "").trim();
  if (!nm) return res.status(400).json({ error: "name required" });

  const db = getDb();
  const existing = await db.get(
    "select * from metrics where metric_date = ? and name = ?",
    date,
    nm
  );

  let nextVal = existing ? Number(existing.value || 0) : 0;

  if (delta !== undefined) nextVal += Number(delta || 0);
  if (value !== undefined) nextVal = Number(value || 0);

  if (!isFinite(nextVal)) nextVal = 0;
  nextVal = Math.max(0, nextVal);

  const nextUnit =
    unit !== undefined
      ? (String(unit || "").trim() || null)
      : (existing?.unit || null);

  await db.run(
    `
    insert into metrics(metric_date, name, value, unit, updated_at)
    values(?, ?, ?, ?, datetime('now'))
    on conflict(metric_date, name) do update set
      value=excluded.value,
      unit=excluded.unit,
      updated_at=datetime('now')
    `,
    date,
    nm,
    nextVal,
    nextUnit
  );

  const row = await db.get(
    "select * from metrics where metric_date = ? and name = ?",
    date,
    nm
  );
  res.json({ metric: row });
});

app.delete("/api/metrics", requireAuth, async (req, res) => {
  const { date, name } = req.body || {};
  if (!date || !name) return res.status(400).json({ error: "date+name required" });

  const db = getDb();
  await db.run("delete from metrics where metric_date = ? and name = ?", String(date), String(name));
  res.json({ ok: true });
});

async function main() {
  await initDb();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`http://localhost:${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
