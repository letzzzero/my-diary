const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

let db;

async function ensureColumn(table, columnDef) {
  // SQLite: добавляем колонку, если её нет. Если уже есть — игнорируем ошибку.
  try {
    await db.exec(`alter table ${table} add column ${columnDef};`);
  } catch (e) {
    // ignore duplicate column errors
  }
}

async function initDb() {
  db = await open({
    filename: "./data.sqlite",
    driver: sqlite3.Database,
  });

  // базовые таблицы
  await db.exec(`
    create table if not exists entries (
      id integer primary key autoincrement,
      entry_date text not null unique,
      content text not null default '',
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now'))
    );

    create table if not exists goals (
      id integer primary key autoincrement,
      title text not null,
      done integer not null default 0,
      created_at text not null default (datetime('now'))
    );

    create table if not exists metrics (
      id integer primary key autoincrement,
      metric_date text not null,
      name text not null,
      value real not null default 0,
      unit text,
      created_at text not null default (datetime('now')),
      updated_at text not null default (datetime('now')),
      unique(metric_date, name)
    );
  `);

  // миграции (v2)
  await ensureColumn("entries", "title text");
  await ensureColumn("entries", "mood integer"); // 1..5

  await ensureColumn("goals", "current real not null default 0");
  await ensureColumn("goals", "target real not null default 1");
  await ensureColumn("goals", "unit text");

  // индексы
  await db.exec(`
    create index if not exists idx_entries_date on entries(entry_date);
    create index if not exists idx_goals_done on goals(done);
    create index if not exists idx_metrics_date on metrics(metric_date);
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error("DB not initialized. Call initDb() first.");
  return db;
}

module.exports = { initDb, getDb };
