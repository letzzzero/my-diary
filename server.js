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
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 дней
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session?.auth) return next();
  return res.redirect("/login");
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

// API: entries
app.get("/api/entry", requireAuth, async (req, res) => {
  const date = String(req.query.date || "");
  if (!date) return res.status(400).json({ error: "date required" });

  const db = getDb();
  const row = await db.get("select * from entries where entry_date = ?", date);
  res.json({ entry: row || { entry_date: date, content: "" } });
});

app.post("/api/entry", requireAuth, async (req, res) => {
  const { date, content } = req.body || {};
  if (!date) return res.status(400).json({ error: "date required" });

  const db = getDb();
  await db.run(
    `
    insert into entries(entry_date, content, updated_at)
    values(?, ?, datetime('now'))
    on conflict(entry_date) do update set
      content=excluded.content,
      updated_at=datetime('now')
    `,
    date,
    String(content || "")
  );

  res.json({ ok: true });
});

app.get("/api/entries", requireAuth, async (req, res) => {
  const db = getDb();
  const rows = await db.all(
    "select entry_date, substr(content, 1, 120) as preview, updated_at from entries order by entry_date desc limit 30"
  );
  res.json({ entries: rows });
});

// API: goals
app.get("/api/goals", requireAuth, async (req, res) => {
  const db = getDb();
  const rows = await db.all("select * from goals order by id desc");
  res.json({ goals: rows });
});

app.post("/api/goals", requireAuth, async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "title required" });

  const db = getDb();
  const result = await db.run("insert into goals(title, done) values(?, 0)", title);
  const goal = await db.get("select * from goals where id = ?", result.lastID);
  res.status(201).json({ goal });
});

app.patch("/api/goals/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const done = req.body?.done ? 1 : 0;

  const db = getDb();
  await db.run("update goals set done = ? where id = ?", done, id);
  const goal = await db.get("select * from goals where id = ?", id);
  res.json({ goal });
});

async function main() {
  await initDb();

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
