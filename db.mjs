import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'pitch.db'));

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT    UNIQUE NOT NULL,
    password_hash TEXT   NOT NULL,
    first_name   TEXT    NOT NULL,
    last_name    TEXT    NOT NULL,
    role         TEXT    NOT NULL CHECK(role IN ('vendor','organiser','admin')),
    status       TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','active','suspended','banned')),
    created_at   DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trading_name TEXT    NOT NULL,
    abn          TEXT,
    abn_verified INTEGER DEFAULT 0,
    mobile       TEXT,
    state        TEXT,
    suburb       TEXT,
    bio          TEXT,
    cuisine_tags TEXT    DEFAULT '[]',
    setup_type   TEXT,
    stall_w      REAL,
    stall_d      REAL,
    power        INTEGER DEFAULT 0,
    water        INTEGER DEFAULT 0,
    price_range  TEXT,
    instagram    TEXT,
    plan         TEXT    NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro')),
    created_at   DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS organisers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_name     TEXT    NOT NULL,
    abn          TEXT,
    abn_verified INTEGER DEFAULT 0,
    website      TEXT,
    state        TEXT,
    suburb       TEXT,
    phone        TEXT,
    bio          TEXT,
    event_types  TEXT    DEFAULT '[]',
    event_scale  TEXT,
    stall_range  TEXT,
    referral     TEXT,
    created_at   DATETIME DEFAULT (datetime('now'))
  );
`);

// ── Prepared statements ────────────────────────────────────────────────────

export const stmts = {
  // users
  createUser: db.prepare(`
    INSERT INTO users (email, password_hash, first_name, last_name, role)
    VALUES (@email, @password_hash, @first_name, @last_name, @role)
  `),
  getUserByEmail: db.prepare(`SELECT * FROM users WHERE email = ?`),
  getUserById:    db.prepare(`SELECT * FROM users WHERE id = ?`),
  setUserStatus:  db.prepare(`UPDATE users SET status = ? WHERE id = ?`),

  // vendors
  createVendor: db.prepare(`
    INSERT INTO vendors
      (user_id, trading_name, abn, abn_verified, mobile, state, suburb, bio,
       cuisine_tags, setup_type, stall_w, stall_d, power, water, price_range, instagram, plan)
    VALUES
      (@user_id, @trading_name, @abn, @abn_verified, @mobile, @state, @suburb, @bio,
       @cuisine_tags, @setup_type, @stall_w, @stall_d, @power, @water, @price_range, @instagram, @plan)
  `),
  getVendorByUserId: db.prepare(`SELECT * FROM vendors WHERE user_id = ?`),
  allVendors: db.prepare(`
    SELECT v.*, u.email, u.first_name, u.last_name, u.status, u.created_at as joined
    FROM vendors v JOIN users u ON v.user_id = u.id
    ORDER BY v.created_at DESC
  `),
  vendorsByStatus: db.prepare(`
    SELECT v.*, u.email, u.first_name, u.last_name, u.status, u.created_at as joined
    FROM vendors v JOIN users u ON v.user_id = u.id
    WHERE u.status = ?
    ORDER BY v.created_at DESC
  `),

  // organisers
  createOrganiser: db.prepare(`
    INSERT INTO organisers
      (user_id, org_name, abn, abn_verified, website, state, suburb, phone, bio,
       event_types, event_scale, stall_range, referral)
    VALUES
      (@user_id, @org_name, @abn, @abn_verified, @website, @state, @suburb, @phone, @bio,
       @event_types, @event_scale, @stall_range, @referral)
  `),
  getOrganiserByUserId: db.prepare(`SELECT * FROM organisers WHERE user_id = ?`),
  allOrganisers: db.prepare(`
    SELECT o.*, u.email, u.first_name, u.last_name, u.status, u.created_at as joined
    FROM organisers o JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `),
  organisersByStatus: db.prepare(`
    SELECT o.*, u.email, u.first_name, u.last_name, u.status, u.created_at as joined
    FROM organisers o JOIN users u ON o.user_id = u.id
    WHERE u.status = ?
    ORDER BY o.created_at DESC
  `),

  // admin actions
  updateUserStatus: db.prepare(`UPDATE users SET status = ? WHERE id = ?`),

  // counts
  countVendors:    db.prepare(`SELECT COUNT(*) as n FROM users WHERE role='vendor'`),
  countOrganisers: db.prepare(`SELECT COUNT(*) as n FROM users WHERE role='organiser'`),
  countPending:    db.prepare(`SELECT COUNT(*) as n FROM users WHERE status='pending'`),
};

// ── Transactions ───────────────────────────────────────────────────────────

export const txSignupVendor = db.transaction((userData, vendorData) => {
  const userResult = stmts.createUser.run(userData);
  const userId = userResult.lastInsertRowid;
  stmts.createVendor.run({ ...vendorData, user_id: userId });
  return userId;
});

export const txSignupOrganiser = db.transaction((userData, organiserData) => {
  const userResult = stmts.createUser.run(userData);
  const userId = userResult.lastInsertRowid;
  stmts.createOrganiser.run({ ...organiserData, user_id: userId });
  return userId;
});

export default db;
