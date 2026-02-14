const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

let db;

async function initDb() {
  db = await open({
    filename: "./data.sqlite",
    driver: sqlite3.Database,
  });

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
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error("DB not initialized. Call initDb() first.");
  return db;
}

module.exports = { initDb, getDb };
