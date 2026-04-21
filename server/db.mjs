import bcryptjs from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Database client ──────────────────────────────────────────────────────────
// Vercel/Turso: @libsql/client/web  — async HTTP, required for serverless
// Local:        better-sqlite3      — synchronous, zero-latency, no overhead
//
// Both expose the same async interface (.get/.all/.run return Promises) so
// the rest of the codebase is unchanged.

let prepare;
let _safeExec;   // runs a single DDL statement, silently ignores errors (migrations)
let _execSchema; // runs a multi-statement schema block
let _txSignupVendor;
let _txSignupOrganiser;
let _txSignupFoodie;
let _client; // libsql client (Vercel path only)
let _localDb; // better-sqlite3 instance (local path only)

if (process.env.TURSO_DATABASE_URL) {
  // ── Vercel / Turso ───────────────────────────────────────────────────────
  const { createClient } = await import('@libsql/client/web');
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const toPlain = v => typeof v === 'bigint' ? Number(v) : v;
  const convertRow = row => {
    if (!row) return null;
    const out = {};
    for (const [k, v] of Object.entries(row)) out[k] = toPlain(v);
    return out;
  };
  const norm = (...a) => {
    if (!a.length) return [];
    if (a.length === 1 && a[0] !== null && typeof a[0] === 'object' && !Array.isArray(a[0])) return a[0];
    return a;
  };

  prepare = sql => ({
    get: async (...a) => { const r = await _client.execute({ sql, args: norm(...a) }); return convertRow(r.rows[0] ?? null); },
    all: async (...a) => { const r = await _client.execute({ sql, args: norm(...a) }); return r.rows.map(convertRow); },
    run: async (...a) => { const r = await _client.execute({ sql, args: norm(...a) }); return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected }; },
  });

  _safeExec   = async sql => { try { await _client.execute(sql); } catch {} };
  _execSchema = async sql => { await _client.executeMultiple(sql); };

  _txSignupVendor = async (userData, vendorData) => {
    const tx = await _client.transaction('write');
    try {
      const r = await tx.execute({ sql: `INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`, args: userData });
      const userId = Number(r.lastInsertRowid);
      await tx.execute({ sql: `INSERT INTO vendors (user_id,trading_name,abn,abn_verified,mobile,state,suburb,bio,cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan) VALUES (@user_id,@trading_name,@abn,@abn_verified,@mobile,@state,@suburb,@bio,@cuisine_tags,@setup_type,@stall_w,@stall_d,@power,@water,@price_range,@instagram,@plan)`, args: { ...vendorData, user_id: userId } });
      await tx.commit();
      return userId;
    } catch (e) { await tx.rollback(); throw e; }
  };

  _txSignupOrganiser = async (userData, organiserData) => {
    const tx = await _client.transaction('write');
    try {
      const r = await tx.execute({ sql: `INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`, args: userData });
      const userId = Number(r.lastInsertRowid);
      await tx.execute({ sql: `INSERT INTO organisers (user_id,org_name,abn,abn_verified,website,state,suburb,phone,bio,event_types,event_scale,stall_range,referral) VALUES (@user_id,@org_name,@abn,@abn_verified,@website,@state,@suburb,@phone,@bio,@event_types,@event_scale,@stall_range,@referral)`, args: { ...organiserData, user_id: userId } });
      await tx.commit();
      return userId;
    } catch (e) { await tx.rollback(); throw e; }
  };

  _txSignupFoodie = async (userData) => {
    const tx = await _client.transaction('write');
    try {
      const r = await tx.execute({ sql: `INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`, args: userData });
      const userId = Number(r.lastInsertRowid);
      await tx.execute({ sql: `INSERT INTO foodies (user_id) VALUES (?)`, args: [userId] });
      await tx.commit();
      return userId;
    } catch (e) { await tx.rollback(); throw e; }
  };

} else {
  // ── Local / better-sqlite3 ───────────────────────────────────────────────
  // Synchronous, in-process SQLite. Queries complete in microseconds.
  const { default: Database } = await import('better-sqlite3');
  _localDb = new Database(path.join(__dirname, '..', 'pitch.db'));
  _localDb.pragma('journal_mode = WAL');

  // norm always returns an array so we can spread into stmt.get/all/run
  const norm = (...a) => {
    if (!a.length) return [];
    if (a.length === 1 && a[0] !== null && typeof a[0] === 'object' && !Array.isArray(a[0])) return [a[0]];
    return a;
  };

  prepare = sql => {
    const stmt = _localDb.prepare(sql);
    return {
      get: (...a) => Promise.resolve(stmt.get(...norm(...a)) ?? null),
      all: (...a) => Promise.resolve(stmt.all(...norm(...a))),
      run: (...a) => { const r = stmt.run(...norm(...a)); return Promise.resolve({ lastInsertRowid: r.lastInsertRowid, changes: r.changes }); },
    };
  };

  _safeExec   = sql => { try { _localDb.exec(sql); } catch {} return Promise.resolve(); };
  _execSchema = sql => { _localDb.exec(sql); return Promise.resolve(); };

  _txSignupVendor = (userData, vendorData) => {
    const fn = _localDb.transaction(() => {
      const r = _localDb.prepare(`INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`).run(userData);
      const userId = r.lastInsertRowid;
      _localDb.prepare(`INSERT INTO vendors (user_id,trading_name,abn,abn_verified,mobile,state,suburb,bio,cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan) VALUES (@user_id,@trading_name,@abn,@abn_verified,@mobile,@state,@suburb,@bio,@cuisine_tags,@setup_type,@stall_w,@stall_d,@power,@water,@price_range,@instagram,@plan)`).run({ ...vendorData, user_id: userId });
      return userId;
    });
    return Promise.resolve(fn());
  };

  _txSignupOrganiser = (userData, organiserData) => {
    const fn = _localDb.transaction(() => {
      const r = _localDb.prepare(`INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`).run(userData);
      const userId = r.lastInsertRowid;
      _localDb.prepare(`INSERT INTO organisers (user_id,org_name,abn,abn_verified,website,state,suburb,phone,bio,event_types,event_scale,stall_range,referral) VALUES (@user_id,@org_name,@abn,@abn_verified,@website,@state,@suburb,@phone,@bio,@event_types,@event_scale,@stall_range,@referral)`).run({ ...organiserData, user_id: userId });
      return userId;
    });
    return Promise.resolve(fn());
  };

  _txSignupFoodie = (userData) => {
    const fn = _localDb.transaction(() => {
      const r = _localDb.prepare(`INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`).run(userData);
      const userId = r.lastInsertRowid;
      _localDb.prepare(`INSERT INTO foodies (user_id) VALUES (?)`).run(userId);
      return userId;
    });
    return Promise.resolve(fn());
  };
}

// ── Schema version — bump this whenever migrations are added ─────────────────
// On a versioned DB the entire migration block is skipped (1 read vs 50+ calls).
const SCHEMA_VERSION = 20;
let _schemaVersion = 0;
try {
  const _ver = await prepare(`SELECT v FROM _schema_meta LIMIT 1`).get();
  _schemaVersion = _ver?.v ?? 0;
} catch { /* table doesn't exist yet */ }

// ── Schema + seed guard ──────────────────────────────────────────────────────
let _needsSeed = false;
if (_schemaVersion < SCHEMA_VERSION) {
try {
  const _check = await prepare(`SELECT COUNT(*) as n FROM users`).get();
  _needsSeed = Number(_check.n) === 0;
} catch {
  // First boot — schema doesn't exist yet
  await _execSchema(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      email             TEXT    UNIQUE NOT NULL,
      password_hash     TEXT    NOT NULL,
      first_name        TEXT    NOT NULL,
      last_name         TEXT    NOT NULL,
      role              TEXT    NOT NULL CHECK(role IN ('vendor','organiser','admin','foodie')),
      status            TEXT    NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','active','suspended','banned','rejected')),
      email_verified    INTEGER NOT NULL DEFAULT 0,
      phone_verified    INTEGER NOT NULL DEFAULT 0,
      oauth_provider    TEXT,
      oauth_sub         TEXT,
      force_verified    INTEGER DEFAULT 0,
      suspended_reason  TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      last_active       DATETIME,
      created_at        DATETIME DEFAULT (datetime('now')),
      avatar_url        TEXT
    );

    CREATE TABLE IF NOT EXISTS verification_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT    NOT NULL CHECK(type IN ('email','phone')),
      code        TEXT    NOT NULL,
      target      TEXT    NOT NULL,
      expires_at  DATETIME NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trading_name TEXT    NOT NULL,
      abn          TEXT,
      abn_verified INTEGER DEFAULT 0,
      abn_entity_name   TEXT,
      abn_match         TEXT,
      abn_verified_at   DATETIME,
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
      plan         TEXT    NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro','growth')),
      photos            TEXT    DEFAULT '[]',
      food_safety_url   TEXT,
      pli_url           TEXT,
      council_url       TEXT,
      pli_insured_name    TEXT,
      pli_policy_number   TEXT,
      pli_coverage_amount TEXT,
      pli_expiry          TEXT,
      pli_status          TEXT DEFAULT 'none',
      pli_analysed_at     DATETIME,
      pli_flags           TEXT DEFAULT '[]',
      food_safety_status           TEXT DEFAULT 'none',
      council_status               TEXT DEFAULT 'none',
      pli_rejection_reason         TEXT,
      food_safety_rejection_reason TEXT,
      council_rejection_reason     TEXT,
      featured            INTEGER NOT NULL DEFAULT 0,
      featured_at         DATETIME,
      paused              INTEGER NOT NULL DEFAULT 0,
      notif_apps          INTEGER NOT NULL DEFAULT 1,
      notif_docs          INTEGER NOT NULL DEFAULT 1,
      notif_reviews       INTEGER NOT NULL DEFAULT 0,
      notif_payments      INTEGER NOT NULL DEFAULT 1,
      apps_this_month     INTEGER NOT NULL DEFAULT 0,
      apps_reset_month    TEXT NOT NULL DEFAULT '',
      trial_ends_at       DATETIME,
      subscription_status TEXT NOT NULL DEFAULT 'active',
      calendar_feed_token TEXT,
      plan_override       INTEGER NOT NULL DEFAULT 0,
      plan_override_by    INTEGER,
      plan_override_at    DATETIME,
      plan_override_reason TEXT,
      plan_override_expires DATETIME,
      default_apply_message TEXT,
      timezone            TEXT DEFAULT 'Australia/Adelaide',
      invoice_business_name TEXT,
      invoice_address     TEXT,
      hide_phone          INTEGER NOT NULL DEFAULT 0,
      hide_abn            INTEGER NOT NULL DEFAULT 0,
      hide_reviews        INTEGER NOT NULL DEFAULT 0,
      stripe_customer_id     TEXT,
      stripe_subscription_id TEXT,
      created_at   DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS organisers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_name     TEXT    NOT NULL,
      abn          TEXT,
      abn_verified INTEGER DEFAULT 0,
      abn_entity_name TEXT,
      abn_match       TEXT,
      abn_verified_at DATETIME,
      website      TEXT,
      state        TEXT,
      suburb       TEXT,
      phone        TEXT,
      bio          TEXT,
      event_types  TEXT    DEFAULT '[]',
      event_scale  TEXT,
      stall_range  TEXT,
      referral     TEXT,
      paused               INTEGER NOT NULL DEFAULT 0,
      notif_new_apps       INTEGER NOT NULL DEFAULT 1,
      notif_deadlines      INTEGER NOT NULL DEFAULT 1,
      notif_messages       INTEGER NOT NULL DEFAULT 0,
      notif_payments       INTEGER NOT NULL DEFAULT 1,
      notif_post_event     INTEGER NOT NULL DEFAULT 1,
      calendar_feed_token  TEXT,
      default_stall_fee_min INTEGER,
      default_stall_fee_max INTEGER,
      default_spots        INTEGER,
      default_booth_size   TEXT,
      default_power        INTEGER NOT NULL DEFAULT 0,
      default_water        INTEGER NOT NULL DEFAULT 0,
      timezone             TEXT DEFAULT 'Australia/Adelaide',
      auto_response_template TEXT,
      banner_url           TEXT,
      time_format          TEXT DEFAULT '12',
      created_at   DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      slug              TEXT    UNIQUE NOT NULL,
      name              TEXT    NOT NULL,
      category          TEXT,
      status            TEXT    NOT NULL DEFAULT 'published'
                                CHECK(status IN ('published','archived','deleted')),
      suburb            TEXT,
      state             TEXT,
      date_sort         TEXT,
      date_end          TEXT,
      organiser_name    TEXT,
      organiser_user_id INTEGER REFERENCES users(id),
      description       TEXT,
      stalls_available  INTEGER,
      date_text         TEXT,
      venue_name        TEXT,
      stall_fee_min     INTEGER,
      stall_fee_max     INTEGER,
      deadline          TEXT,
      featured          INTEGER NOT NULL DEFAULT 0,
      featured_at       DATETIME,
      cover_image       TEXT,
      cancelled_at      DATETIME,
      cancel_reason     TEXT,
      is_recurring      INTEGER NOT NULL DEFAULT 0,
      recur_frequency   TEXT,
      lat               REAL,
      lng               REAL,
      suspended_by_admin INTEGER NOT NULL DEFAULT 0,
      completed_at      DATETIME,
      booth_size        TEXT,
      setup_time        TEXT,
      packdown_time     TEXT,
      power_available   INTEGER NOT NULL DEFAULT 0,
      power_amps        TEXT,
      water_available   INTEGER NOT NULL DEFAULT 0,
      cuisines_wanted   TEXT DEFAULT '[]',
      exclusivity       INTEGER NOT NULL DEFAULT 0,
      looking_for       TEXT,
      custom_requirements TEXT,
      cancel_policy     TEXT,
      payment_terms     TEXT,
      created_at        DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan        TEXT    NOT NULL DEFAULT 'free',
      amount      REAL    NOT NULL DEFAULT 0,
      currency    TEXT    DEFAULT 'AUD',
      status      TEXT    NOT NULL DEFAULT 'paid'
                          CHECK(status IN ('paid','failed','refunded','pending')),
      description TEXT,
      created_at  DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_applications (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status         TEXT NOT NULL DEFAULT 'pending'
                     CHECK(status IN ('pending','approved','rejected','withdrawn')),
      message        TEXT,
      attended       INTEGER,
      spot_number    INTEGER,
      approved_at    DATETIME,
      updated_at     DATETIME,
      created_at     DATETIME DEFAULT (datetime('now')),
      UNIQUE(event_id, vendor_user_id)
    );

    CREATE TABLE IF NOT EXISTS presignup_codes (
      email    TEXT PRIMARY KEY,
      code     TEXT NOT NULL,
      expires  INTEGER NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0
    );
  `);
  _needsSeed = true;
}

// ── Migrations (safe to run every boot) ─────────────────────────────────────
await _safeExec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN photos TEXT DEFAULT '[]'`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN food_safety_url TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_url TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN council_url TEXT`);
// PLI auto-analysis fields
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_insured_name TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_policy_number TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_coverage_amount TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_expiry TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_status TEXT DEFAULT 'none'`);  // none | pending | verified | flagged | expired
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_analysed_at DATETIME`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_flags TEXT DEFAULT '[]'`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN food_safety_status TEXT DEFAULT 'none'`);  // none | pending | verified | rejected
await _safeExec(`ALTER TABLE vendors ADD COLUMN council_status TEXT DEFAULT 'none'`);      // none | pending | verified | rejected
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_rejection_reason TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN food_safety_rejection_reason TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN council_rejection_reason TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN abn_entity_name TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN abn_match TEXT`);        // match | partial | mismatch | unknown
await _safeExec(`ALTER TABLE vendors ADD COLUMN abn_verified_at DATETIME`);
await _safeExec(`ALTER TABLE events ADD COLUMN date_end TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN stall_fee_min INTEGER`);
await _safeExec(`ALTER TABLE events ADD COLUMN stall_fee_max INTEGER`);
await _safeExec(`ALTER TABLE events ADD COLUMN deadline TEXT`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN spot_number INTEGER`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN approved_at DATETIME`);
await _safeExec(`ALTER TABLE events ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE events ADD COLUMN featured_at DATETIME`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN featured_at DATETIME`);
// Deduplicate organisers rows (caused by missing UNIQUE constraint on user_id)
await _safeExec(`DELETE FROM organisers WHERE id NOT IN (SELECT MIN(id) FROM organisers GROUP BY user_id)`);
// Add unique index so this can never happen again
await _safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organisers_user_id ON organisers(user_id)`);
// Link seeded events (organiser_user_id=NULL) to their matching organiser accounts by org_name
await _safeExec(`UPDATE events SET organiser_user_id = (SELECT o.user_id FROM organisers o WHERE o.org_name = events.organiser_name LIMIT 1) WHERE organiser_user_id IS NULL AND organiser_name IS NOT NULL`);
// Fallback: assign any available organiser to events still unlinked after name-match
await _safeExec(`UPDATE events SET organiser_user_id = (SELECT user_id FROM organisers LIMIT 1) WHERE organiser_user_id IS NULL`);

// ── Organiser ABN verification columns ───────────────────────────────────────
await _safeExec(`ALTER TABLE organisers ADD COLUMN abn_entity_name TEXT`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN abn_match TEXT`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN abn_verified_at DATETIME`);

// ── Organiser feature migrations ──────────────────────────────────────────────
await _safeExec(`ALTER TABLE organisers ADD COLUMN paused INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN notif_new_apps INTEGER NOT NULL DEFAULT 1`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN notif_deadlines INTEGER NOT NULL DEFAULT 1`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN notif_messages INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN notif_payments INTEGER NOT NULL DEFAULT 1`);
await _safeExec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    audience   TEXT NOT NULL DEFAULT 'all',
    created_by INTEGER,
    delivery   TEXT NOT NULL DEFAULT 'inapp',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

await _safeExec(`ALTER TABLE events ADD COLUMN cover_image TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN cancelled_at DATETIME`);
await _safeExec(`ALTER TABLE events ADD COLUMN cancel_reason TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE events ADD COLUMN recur_frequency TEXT`);

await _safeExec(`
  CREATE TABLE IF NOT EXISTS organiser_vendor_ratings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    organiser_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id          INTEGER REFERENCES events(id) ON DELETE SET NULL,
    punctual          INTEGER NOT NULL DEFAULT 3 CHECK(punctual BETWEEN 1 AND 5),
    presentation      INTEGER NOT NULL DEFAULT 3 CHECK(presentation BETWEEN 1 AND 5),
    would_rebook      INTEGER NOT NULL DEFAULT 1,
    notes             TEXT,
    created_at        DATETIME DEFAULT (datetime('now')),
    UNIQUE(organiser_user_id, vendor_user_id, event_id)
  )
`);

await _safeExec(`
  CREATE TABLE IF NOT EXISTS organiser_reviews (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    organiser_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id          INTEGER REFERENCES events(id) ON DELETE SET NULL,
    event_name        TEXT,
    rating            INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    body              TEXT,
    flagged           INTEGER NOT NULL DEFAULT 0,
    created_at        DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_org_reviews ON organiser_reviews(organiser_user_id)`);

// ── Vendor feature migrations ─────────────────────────────────────────────────
await _safeExec(`ALTER TABLE vendors ADD COLUMN paused INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN notif_apps INTEGER NOT NULL DEFAULT 1`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN notif_docs INTEGER NOT NULL DEFAULT 1`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN notif_reviews INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN notif_payments INTEGER NOT NULL DEFAULT 1`);

// ── Subscription feature migrations ──────────────────────────────────────────
await _safeExec(`ALTER TABLE vendors ADD COLUMN apps_this_month INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN apps_reset_month TEXT NOT NULL DEFAULT ''`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN trial_ends_at DATETIME`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active'`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN calendar_feed_token TEXT`);
await _safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_cal_token ON vendors(calendar_feed_token)`);

await _safeExec(`ALTER TABLE organisers ADD COLUMN calendar_feed_token TEXT`);
await _safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organisers_cal_token ON organisers(calendar_feed_token)`);

// ── Vendors: add 'growth' to plan CHECK constraint ───────────────────────────
{
  let vendorSchema = '';
  try {
    if (process.env.TURSO_DATABASE_URL) {
      const r = await _client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='vendors'`);
      vendorSchema = (r.rows[0]?.sql) || '';
    } else {
      const row = _localDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='vendors'`).get();
      vendorSchema = (row?.sql) || '';
    }
  } catch {}
  if (vendorSchema && !vendorSchema.includes("'growth'")) {
    const migSQL = `
      ALTER TABLE vendors RENAME TO _vendors_old;
      CREATE TABLE vendors (
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
        plan         TEXT    NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro','growth')),
        photos            TEXT    DEFAULT '[]',
        food_safety_url   TEXT,
        pli_url           TEXT,
        council_url       TEXT,
        paused            INTEGER NOT NULL DEFAULT 0,
        notif_apps        INTEGER NOT NULL DEFAULT 1,
        notif_docs        INTEGER NOT NULL DEFAULT 1,
        notif_reviews     INTEGER NOT NULL DEFAULT 0,
        notif_payments    INTEGER NOT NULL DEFAULT 1,
        featured          INTEGER NOT NULL DEFAULT 0,
        created_at   DATETIME DEFAULT (datetime('now'))
      );
      INSERT INTO vendors (id,user_id,trading_name,abn,abn_verified,mobile,state,suburb,bio,cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan,photos,food_safety_url,pli_url,council_url,paused,notif_apps,notif_docs,notif_reviews,notif_payments,featured,created_at)
        SELECT id,user_id,trading_name,abn,abn_verified,mobile,state,suburb,bio,cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan,photos,food_safety_url,pli_url,council_url,paused,notif_apps,notif_docs,notif_reviews,notif_payments,featured,created_at FROM _vendors_old;
      DROP TABLE _vendors_old;
    `;
    try {
      if (process.env.TURSO_DATABASE_URL) {
        await _client.execute('PRAGMA foreign_keys=OFF');
        await _client.executeMultiple(migSQL);
        await _client.execute('PRAGMA foreign_keys=ON');
      } else {
        _localDb.pragma('foreign_keys=OFF');
        _localDb.exec(migSQL);
        _localDb.pragma('foreign_keys=ON');
      }
    } catch (e) { console.error('[db] Growth plan migration failed:', e); }
  }
}
await _safeExec('DROP TABLE IF EXISTS _vendors_old');

await _safeExec(`
  CREATE TABLE IF NOT EXISTS vendor_reviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id       INTEGER REFERENCES events(id) ON DELETE SET NULL,
    event_name     TEXT,
    reviewer_name  TEXT NOT NULL DEFAULT 'Market Visitor',
    rating         INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    body           TEXT,
    flagged        INTEGER NOT NULL DEFAULT 0,
    created_at     DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_reviews_vendor ON vendor_reviews(vendor_user_id)`);

await _safeExec(`
  CREATE TABLE IF NOT EXISTS stall_fees (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id       INTEGER REFERENCES events(id) ON DELETE SET NULL,
    event_name     TEXT NOT NULL,
    amount         REAL NOT NULL,
    due_date       TEXT,
    status         TEXT NOT NULL DEFAULT 'unpaid'
                   CHECK(status IN ('unpaid','paid','refunded','cancelled')),
    refund_status  TEXT,
    paid_at        DATETIME,
    stripe_payment_intent_id TEXT,
    created_at     DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_fees_vendor ON stall_fees(vendor_user_id)`);

// ── Messaging tables ─────────────────────────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS message_threads (
    thread_key        TEXT PRIMARY KEY,
    vendor_user_id    INTEGER NOT NULL,
    organiser_user_id INTEGER NOT NULL,
    created_at        DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`
  CREATE TABLE IF NOT EXISTS messages (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_key     TEXT NOT NULL,
    sender_user_id INTEGER NOT NULL,
    body           TEXT NOT NULL,
    is_read        INTEGER DEFAULT 0,
    created_at     DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_key, id)`);

// ── Foodie role migration (users.role CHECK must include 'foodie') ────────────
{
  let existingSchema = '';
  try {
    if (process.env.TURSO_DATABASE_URL) {
      const r = await _client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`);
      existingSchema = (r.rows[0]?.sql) || '';
    } else {
      const row = _localDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get();
      existingSchema = (row?.sql) || '';
    }
  } catch {}
  if (existingSchema && !existingSchema.includes("'foodie'")) {
    const migSQL = `
      ALTER TABLE users RENAME TO _users_old;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('vendor','organiser','admin','foodie')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','banned','rejected')),
        email_verified INTEGER NOT NULL DEFAULT 0,
        phone_verified INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now')),
        avatar_url TEXT
      );
      INSERT INTO users SELECT * FROM _users_old;
      DROP TABLE _users_old;
    `;
    try {
      if (process.env.TURSO_DATABASE_URL) {
        await _client.execute('PRAGMA foreign_keys=OFF');
        await _client.executeMultiple(migSQL);
        await _client.execute('PRAGMA foreign_keys=ON');
      } else {
        _localDb.pragma('foreign_keys=OFF');
        _localDb.exec(migSQL);
        _localDb.pragma('foreign_keys=ON');
      }
    } catch (e) { console.error('[db] Foodie role migration failed:', e); }
  }
}

// Clean up backup table if migration left it behind
await _safeExec(`DROP TABLE IF EXISTS _users_old`);

// ── Fix broken FK references left by users rename migration (Turso/local) ────
// When SQLite renames a table, child FK refs are updated. If the backup was
// later dropped, child tables are left referencing a non-existent "_users_old".
// Heal by patching sqlite_master via writable_schema if needed.
if (!process.env.TURSO_DATABASE_URL) {
  try {
    const brokenCount = _localDb.prepare(
      `SELECT COUNT(*) as n FROM sqlite_master WHERE sql LIKE '%"_users_old"%'`
    ).get()?.n || 0;
    if (brokenCount > 0) {
      _localDb.pragma('writable_schema=1');
      _localDb.prepare(
        `UPDATE sqlite_master SET sql=REPLACE(sql,'"_users_old"','"users"') WHERE sql LIKE '%"_users_old"%'`
      ).run();
      _localDb.pragma('writable_schema=0');
      console.log('[db] Healed FK references from _users_old → users');
    }
  } catch (e) { console.error('[db] FK heal failed:', e.message); }
}

// ── Foodie tables ─────────────────────────────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS foodies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suburb      TEXT,
    radius_km   INTEGER DEFAULT 25,
    notif_area  INTEGER DEFAULT 1,
    notif_cat   TEXT DEFAULT '[]',
    created_at  DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id)
  )
`);
await _safeExec(`
  CREATE TABLE IF NOT EXISTS saved_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_slug TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, event_slug)
  )
`);
// Migrate followed_vendors: vendor_user_id needs to be TEXT (no FK) to support slug-based IDs
if (_localDb) {
  const info = _localDb.pragma('table_info(followed_vendors)');
  const col = info.find(c => c.name === 'vendor_user_id');
  if (col && col.type === 'INTEGER') {
    _localDb.exec('DROP TABLE IF EXISTS followed_vendors');
  }
}
await _safeExec(`
  CREATE TABLE IF NOT EXISTS followed_vendors (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_user_id  TEXT NOT NULL,
    created_at      DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, vendor_user_id)
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_saved_events_user ON saved_events(user_id)`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_followed_vendors_user ON followed_vendors(user_id)`);

// ── Content flags ──────────────────────────────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS content_flags (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT NOT NULL CHECK(type IN ('photo','listing','profile')),
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    target_name    TEXT,
    reason         TEXT,
    reporter_count INTEGER DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','removed','warned','dismissed')),
    admin_notes    TEXT,
    description    TEXT,
    evidence_url   TEXT,
    created_at     DATETIME DEFAULT (datetime('now')),
    resolved_at    DATETIME,
    resolved_by    INTEGER REFERENCES users(id)
  )
`);

// Add description + evidence columns for expandable detail view
await _safeExec(`ALTER TABLE content_flags ADD COLUMN description TEXT`);
await _safeExec(`ALTER TABLE content_flags ADD COLUMN evidence_url TEXT`);

// Seed sample flags — split into individual INSERTs for Turso/libsql compatibility
await _safeExec(`INSERT OR IGNORE INTO content_flags (id,type,target_name,reason,description,evidence_url,reporter_count,status,created_at) VALUES (1,'photo','Smoky Joe''s BBQ','Photo contains competitor branding and misleading claims','The uploaded hero photo for Smoky Joe''s BBQ stall includes a clearly visible banner from "Flame Masters Catering" in the background, which is a competing vendor on the platform. Additionally, the photo shows a "Best BBQ in SA — voted #1" claim overlaid on the image, but no such award exists in any verifiable directory. Two separate vendors reported this within 24 hours, both citing concerns about misleading marketing that could confuse event organisers browsing vendor profiles.','https://placehold.co/600x400/1A1612/C0392B?text=Flagged+Photo+Evidence',2,'pending',datetime('now','-2 hours'))`);
await _safeExec(`INSERT OR IGNORE INTO content_flags (id,type,target_name,reason,description,evidence_url,reporter_count,status,created_at) VALUES (2,'listing','Adelaide City Council Events','Listing description contains inaccurate stall availability claims','The event listing for "Adelaide Fringe Food Fair 2026" states there are "50+ stalls available, first come first served" but the actual council-approved site plan only permits 28 vendor stalls. Three vendors have reported this after paying application fees and being told the event was oversubscribed. The listing also mentions "free power hookups for all vendors" which contradicts the organiser''s own terms document (uploaded during verification) that lists a $45/day power fee. This is a repeat issue — the same organiser had a similar complaint on a December 2025 listing that was resolved with a warning.','https://placehold.co/600x400/1A1612/C9840A?text=Listing+Screenshot',3,'pending',datetime('now','-1 day'))`);
await _safeExec(`INSERT OR IGNORE INTO content_flags (id,type,target_name,reason,description,evidence_url,reporter_count,status,created_at) VALUES (3,'profile','Best Kebabs AU','Profile photos appear to be stock images. No genuine event history.','The vendor profile for "Best Kebabs AU" uses what appear to be stock photography images — a reverse image search on two of the three uploaded photos returns results from Shutterstock and Adobe Stock. The profile claims to have operated at "over 30 events across Adelaide" but the account was created 5 days ago and has zero verified event participations on the platform. The bio text also contains copy that matches a template found on multiple generic food truck websites. One reporter flagged this as a potential impersonation of a legitimate kebab vendor operating in the northern suburbs under a similar name.',NULL,1,'pending',datetime('now','-3 days'))`);

// ── Event coordinates (for map view) ─────────────────────────────────────────
await _safeExec(`ALTER TABLE events ADD COLUMN lat REAL`);
await _safeExec(`ALTER TABLE events ADD COLUMN lng REAL`);

// Seed coordinates for known SA events
const _EVENT_COORDS = {
  'rundle-mall-night-eats':     [-34.9218, 138.5998],
  'showground-harvest-fair':    [-34.9520, 138.6070],
  'fringe-food-village':        [-34.9238, 138.6090],
  'barossa-food-wine':          [-34.5237, 138.9571],
  'glenelg-twilight':           [-34.9828, 138.5161],
  'port-adelaide-night-market': [-34.8476, 138.5082],
  'norwood-food-bazaar':        [-34.9260, 138.6325],
  'victor-harbor-summer-fair':  [-35.5517, 138.6216],
  'prospect-farmers-market':    [-34.9041, 138.5996],
  'westpac-corporate-day':      [-34.9285, 138.5999],
  'henley-sunset-market':       [-34.9217, 138.5014],
  'marion-popup':               [-35.0020, 138.5700],
};
for (const [slug, [lat, lng]] of Object.entries(_EVENT_COORDS)) {
  await _safeExec(`UPDATE events SET lat=${lat},lng=${lng} WHERE slug='${slug}' AND (lat IS NULL OR lat=0)`);
}

// ── Vendor menu items ─────────────────────────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    description    TEXT,
    price_type     TEXT NOT NULL DEFAULT 'exact' CHECK(price_type IN ('exact','range','varies')),
    price_min      REAL,
    price_max      REAL,
    category       TEXT,
    photo_url      TEXT,
    available      INTEGER NOT NULL DEFAULT 1,
    seasonal       INTEGER NOT NULL DEFAULT 0,
    is_signature   INTEGER NOT NULL DEFAULT 0,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     DATETIME DEFAULT (datetime('now')),
    dietary_tags   TEXT
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_menu_vendor ON menu_items(vendor_user_id, sort_order)`);
// Force dietary_tags column — check existence first, then ALTER if missing
if (_client) {
  try {
    const cols = await _client.execute(`PRAGMA table_info(menu_items)`);
    const hasDietary = cols.rows.some(r => r.name === 'dietary_tags');
    if (!hasDietary) {
      await _client.execute('ALTER TABLE menu_items ADD COLUMN dietary_tags TEXT');
      console.log('[db] Added dietary_tags to menu_items');
    }
  } catch(e) { console.error('[db] dietary_tags migration error:', e.message); }
} else {
  try {
    const cols = _localDb.pragma('table_info(menu_items)');
    if (!cols.some(r => r.name === 'dietary_tags')) {
      _localDb.exec('ALTER TABLE menu_items ADD COLUMN dietary_tags TEXT');
      console.log('[db] Added dietary_tags to menu_items');
    }
  } catch(e) { console.error('[db] dietary_tags migration error:', e.message); }
}

// Add attended column for no-show tracking
await _safeExec(`ALTER TABLE event_applications ADD COLUMN attended INTEGER`);

// ── Analytics tracking tables ────────────────────────────────────────────────
await _safeExec(`CREATE TABLE IF NOT EXISTS vendor_profile_views (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_user_id INTEGER,
  viewer_role    TEXT,
  viewer_ip_hash TEXT,
  referrer       TEXT DEFAULT 'direct',
  created_at     DATETIME DEFAULT (datetime('now'))
)`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_vpv_vendor_date ON vendor_profile_views(vendor_user_id, created_at)`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_vpv_vendor_ip   ON vendor_profile_views(vendor_user_id, viewer_ip_hash, created_at)`);

await _safeExec(`CREATE TABLE IF NOT EXISTS vendor_search_appearances (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context        TEXT NOT NULL DEFAULT 'vendors_list',
  created_at     DATETIME DEFAULT (datetime('now'))
)`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_vsa_vendor_date ON vendor_search_appearances(vendor_user_id, created_at)`);

if (_needsSeed) {
  const _ins = prepare(`INSERT OR IGNORE INTO events (slug,name,category,suburb,state,date_sort,organiser_name) VALUES (@slug,@name,@category,@suburb,@state,@date_sort,@organiser_name)`);
  for (const ev of [
    { slug:'rundle-mall-night-eats',     name:'Rundle Mall Night Eats',           category:'Night Market',    suburb:'Adelaide CBD',  state:'SA', date_sort:'2026-04-12', organiser_name:'Adelaide City Council Events' },
    { slug:'showground-harvest-fair',    name:'Adelaide Showground Harvest Fair',  category:'Farmers Market',  suburb:'Wayville',      state:'SA', date_sort:'2026-04-19', organiser_name:'SA Showground Events' },
    { slug:'fringe-food-village',        name:'Fringe Food Village 2026',          category:'Festival',        suburb:'Adelaide CBD',  state:'SA', date_sort:'2026-03-02', organiser_name:'Adelaide Fringe Festival' },
    { slug:'barossa-food-wine',          name:'Barossa Valley Food & Wine',        category:'Festival',        suburb:'Tanunda',       state:'SA', date_sort:'2026-04-26', organiser_name:'Barossa Valley Tourism' },
    { slug:'glenelg-twilight',           name:'Glenelg Twilight Market',           category:'Twilight Market', suburb:'Glenelg',       state:'SA', date_sort:'2026-05-03', organiser_name:'City of Holdfast Bay' },
    { slug:'port-adelaide-night-market', name:'Port Adelaide Night Market',        category:'Night Market',    suburb:'Port Adelaide', state:'SA', date_sort:'2026-05-10', organiser_name:'Port Adelaide Enfield Council' },
    { slug:'norwood-food-bazaar',        name:'Norwood Food Bazaar',               category:'Pop-up',          suburb:'Norwood',       state:'SA', date_sort:'2026-05-17', organiser_name:'Norwood Payneham St Peters Council' },
    { slug:'victor-harbor-summer-fair',  name:'Victor Harbor Summer Fair',         category:'Festival',        suburb:'Victor Harbor', state:'SA', date_sort:'2026-05-24', organiser_name:'Victor Harbor Council' },
    { slug:'prospect-farmers-market',    name:'Prospect Farmers Market',           category:'Farmers Market',  suburb:'Prospect',      state:'SA', date_sort:'2026-05-31', organiser_name:'City of Prospect' },
    { slug:'westpac-corporate-day',      name:'Westpac Corporate Food Day',        category:'Corporate',       suburb:'Adelaide CBD',  state:'SA', date_sort:'2026-06-07', organiser_name:'Westpac Corporate Events' },
    { slug:'henley-sunset-market',       name:'Henley Beach Sunset Market',        category:'Twilight Market', suburb:'Henley Beach',  state:'SA', date_sort:'2026-06-14', organiser_name:'City of Charles Sturt' },
    { slug:'marion-popup',               name:'Marion Shopping Centre Pop-up',     category:'Pop-up',          suburb:'Marion',        state:'SA', date_sort:'2026-06-21', organiser_name:'Westfield Marion Events' },
  ]) await _ins.run(ev);
}

if (_needsSeed) {
  const HASH = await bcryptjs.hash('pitch2026', 8);
  const _su  = prepare(`INSERT OR IGNORE INTO users (email,password_hash,first_name,last_name,role,status) VALUES (@email,@hash,@first_name,@last_name,@role,@status)`);
  const _uid = prepare(`SELECT id FROM users WHERE email=?`);
  const _sv  = prepare(`INSERT OR IGNORE INTO vendors (user_id,trading_name,suburb,state,bio,cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan) VALUES (@user_id,@trading_name,@suburb,@state,@bio,@cuisine_tags,@setup_type,@stall_w,@stall_d,@power,@water,@price_range,@instagram,@plan)`);
  const _so  = prepare(`INSERT OR IGNORE INTO organisers (user_id,org_name,suburb,state,bio,website,phone,event_types,event_scale,stall_range) VALUES (@user_id,@org_name,@suburb,@state,@bio,@website,@phone,@event_types,@event_scale,@stall_range)`);

  for (const v of [
    { email:'joe@smokyjoes.com.au',        first_name:'Joe',    last_name:'Smith',    status:'active',  trading_name:"Smoky Joe's BBQ",   suburb:'Norwood',       state:'SA', bio:"Adelaide's most-loved BBQ food truck, smoking low-and-slow since 2019.", cuisine_tags:'["BBQ"]',             setup_type:'Food Truck',  stall_w:3,   stall_d:3,   power:1, water:0, price_range:'$12–$22', instagram:'@smokyjoes_adl',      plan:'pro'  },
    { email:'maria@tacoloco.com',           first_name:'Maria',  last_name:'Fernandez',status:'active',  trading_name:'Taco Loco',         suburb:'Glenelg',       state:'SA', bio:'Authentic Mexican street food made from scratch every day.',           cuisine_tags:'["Mexican"]',         setup_type:'Pop-up Stall',stall_w:3,   stall_d:2,   power:0, water:1, price_range:'$8–$16',  instagram:'@tacoloco_glenelg',   plan:'pro'  },
    { email:'hello@wokandroll.com.au',      first_name:'David',  last_name:'Chen',     status:'active',  trading_name:'Wok & Roll',        suburb:'Adelaide CBD',  state:'SA', bio:'Modern Asian fusion food truck serving bold, wok-fired flavours.',     cuisine_tags:'["Asian Fusion"]',    setup_type:'Food Truck',  stall_w:3,   stall_d:6,   power:0, water:0, price_range:'$10–$18', instagram:'@wokandroll_adl',     plan:'pro'  },
    { email:'ciao@napoliexpress.com.au',    first_name:'Marco',  last_name:'Rossi',    status:'active',  trading_name:'Napoli Express',    suburb:'Hindmarsh',     state:'SA', bio:'Authentic Neapolitan-style pizza and arancini made fresh on-site.',    cuisine_tags:'["Italian"]',        setup_type:'Pop-up Stall',stall_w:4,   stall_d:3,   power:1, water:1, price_range:'$12–$20', instagram:'@napoliexpressadl',   plan:'free' },
    { email:'hello@thedessertlab.com.au',   first_name:'Sophie', last_name:'Baker',    status:'active',  trading_name:'The Dessert Lab',   suburb:'North Adelaide',state:'SA', bio:'Creative dessert cart serving handcrafted sweets — Instagram-worthy.',  cuisine_tags:'["Desserts"]',        setup_type:'Cart',        stall_w:2,   stall_d:2,   power:1, water:0, price_range:'$7–$14',  instagram:'@thedessertlab',      plan:'pro'  },
    { email:'brew@beanery.com.au',          first_name:'Liam',   last_name:'Watts',    status:'active',  trading_name:'Beanery Coffee Co.',suburb:'Unley',         state:'SA', bio:'Specialty coffee on wheels — single-origin beans, La Marzocco cart.',  cuisine_tags:'["Coffee & Drinks"]', setup_type:'Cart',        stall_w:2,   stall_d:1.5, power:1, water:1, price_range:'$4.50–$8',instagram:'@beanery_coffee',     plan:'free' },
    { email:'eat@greenbowl.com.au',         first_name:'Emma',   last_name:'Park',     status:'active',  trading_name:'Green Bowl',        suburb:'Prospect',      state:'SA', bio:'Wholesome vegan and plant-based street food made fresh on-site.',      cuisine_tags:'["Vegan"]',           setup_type:'Pop-up Stall',stall_w:3,   stall_d:2,   power:0, water:1, price_range:'$12–$18', instagram:'@greenbowl_sa',       plan:'free' },
    { email:'hey@brewskiburgers.com.au',    first_name:'Jack',   last_name:'Murphy',   status:'active',  trading_name:'Brewski Burgers',   suburb:'Port Adelaide', state:'SA', bio:"Port Adelaide's premier burger truck — smash burgers, SA farm beef.",  cuisine_tags:'["Burgers"]',         setup_type:'Food Truck',  stall_w:3,   stall_d:6,   power:0, water:0, price_range:'$12–$22', instagram:'@brewski_burgers',    plan:'free' },
    { email:'catch@oceanandfire.com.au',    first_name:'Sam',    last_name:'Taylor',   status:'active',  trading_name:'Ocean & Fire',      suburb:'Glenelg',       state:'SA', bio:'Premium seafood sourced directly from SA fishermen — grilled fresh.',  cuisine_tags:'["Seafood"]',         setup_type:'Pop-up Stall',stall_w:3,   stall_d:3,   power:1, water:1, price_range:'$14–$28', instagram:'@oceanandfire_sa',    plan:'pro'  },
    { email:'churros@thechurrostand.com.au',first_name:'Carlos', last_name:'Rivera',   status:'active',  trading_name:'The Churro Stand',  suburb:'Adelaide CBD',  state:'SA', bio:'Hot fresh churros with a dozen dipping sauces and creative toppings.', cuisine_tags:'["Desserts"]',        setup_type:'Cart',        stall_w:2,   stall_d:1.5, power:1, water:0, price_range:'$6–$12',  instagram:'@thechurrostand',     plan:'free' },
    { email:'hello@punjabpalace.com.au',    first_name:'Raj',    last_name:'Singh',    status:'active',  trading_name:'Punjab Palace',     suburb:'Elizabeth',     state:'SA', bio:'Authentic Punjabi cooking — slow-cooked curries, tandoor naan, biryani.',cuisine_tags:'["Indian"]',         setup_type:'Food Truck',  stall_w:3,   stall_d:5,   power:0, water:0, price_range:'$10–$18', instagram:'@punjabpalace_adl',   plan:'free' },
    { email:'sip@pressedandbrewed.com.au',  first_name:'Nina',   last_name:'Harris',   status:'pending', trading_name:'Pressed & Brewed',  suburb:'Burnside',      state:'SA', bio:'Cold-pressed juices and filter coffee. All juice pressed fresh on-site.',cuisine_tags:'["Coffee & Drinks"]',setup_type:'Cart',        stall_w:1.5, stall_d:1.5, power:1, water:1, price_range:'$5–$10',  instagram:'@pressedandbrewed',   plan:'free' },
  ]) {
    await _su.run({ email: v.email, hash: HASH, first_name: v.first_name, last_name: v.last_name, role: 'vendor', status: v.status });
    const row = await _uid.get(v.email);
    if (row) await _sv.run({ user_id: row.id, trading_name: v.trading_name, suburb: v.suburb, state: v.state, bio: v.bio, cuisine_tags: v.cuisine_tags, setup_type: v.setup_type, stall_w: v.stall_w, stall_d: v.stall_d, power: v.power, water: v.water, price_range: v.price_range, instagram: v.instagram, plan: v.plan });
  }

  for (const o of [
    { email:'sarah@adelaidecitycouncil.sa.gov.au', first_name:'Sarah', last_name:'Mitchell', org_name:'Adelaide City Council Events',      suburb:'Adelaide CBD',  state:'SA', website:'adelaidecitycouncil.sa.gov.au',  phone:'(08) 8203 7203', bio:'City of Adelaide events team managing major CBD food events.',        event_types:'["Night Market","Festival"]',         event_scale:'Large (500+)',    stall_range:'20–50' },
    { email:'events@showground.com.au',            first_name:'Tom',   last_name:'Brown',    org_name:'SA Showground Events',               suburb:'Wayville',      state:'SA', website:'sashowground.com.au',            phone:'(08) 8210 5100', bio:'SA Showground hosts premier farmers markets and food events.',       event_types:'["Farmers Market"]',                  event_scale:'Medium (100–500)',stall_range:'10–30' },
    { email:'vendors@adelaidefringe.com.au',       first_name:'Alice', last_name:'Webb',     org_name:'Adelaide Fringe Festival',           suburb:'Adelaide CBD',  state:'SA', website:'adelaidefringe.com.au',          phone:'(08) 8100 2000', bio:"The world's second-largest fringe festival, running annually in March.",event_types:'["Festival"]',                       event_scale:'Large (500+)',    stall_range:'30–60' },
    { email:'hello@barossatourism.com.au',         first_name:'Ben',   last_name:'Davis',    org_name:'Barossa Valley Tourism',             suburb:'Tanunda',       state:'SA', website:'barossa.com',                    phone:'(08) 8563 0600', bio:'Barossa Valley Tourism promotes world-class food and wine events.',   event_types:'["Festival"]',                        event_scale:'Medium (100–500)',stall_range:'15–25' },
    { email:'events@holdfast.sa.gov.au',           first_name:'Karen', last_name:'Liu',      org_name:'City of Holdfast Bay',               suburb:'Brighton',      state:'SA', website:'holdfast.sa.gov.au',             phone:'(08) 8229 9999', bio:'Council-run twilight markets and foreshore events in Glenelg.',      event_types:'["Twilight Market","Farmers Market"]', event_scale:'Medium (100–500)',stall_range:'15–30' },
    { email:'events@pae.sa.gov.au',                first_name:'James', last_name:"O'Brien",  org_name:'Port Adelaide Enfield Council',      suburb:'Port Adelaide', state:'SA', website:'portadelaideenfield.sa.gov.au',  phone:'(08) 8405 6600', bio:"Night markets celebrating Port Adelaide's maritime heritage.",         event_types:'["Night Market"]',                    event_scale:'Medium (100–500)',stall_range:'15–25' },
    { email:'events@npsp.sa.gov.au',               first_name:'Lisa',  last_name:'Nguyen',   org_name:'Norwood Payneham St Peters Council', suburb:'Norwood',       state:'SA', website:'npsp.sa.gov.au',                 phone:'(08) 8366 4555', bio:'Curated pop-up food events on The Parade and surrounds.',            event_types:'["Pop-up"]',                          event_scale:'Small (<100)',    stall_range:'8–15'  },
    { email:'events@victorharbor.sa.gov.au',       first_name:'Grant', last_name:'Wilson',   org_name:'Victor Harbor Council',              suburb:'Victor Harbor', state:'SA', website:'victorharbor.sa.gov.au',         phone:'(08) 8551 0500', bio:'Fleurieu Peninsula community festivals drawing statewide crowds.',    event_types:'["Festival"]',                        event_scale:'Large (500+)',    stall_range:'20–40' },
    { email:'events@prospect.sa.gov.au',           first_name:'Helen', last_name:'Carter',   org_name:'City of Prospect',                   suburb:'Prospect',      state:'SA', website:'prospect.sa.gov.au',             phone:'(08) 8269 5355', bio:'Community-focused farmers market connecting producers with locals.',   event_types:'["Farmers Market"]',                  event_scale:'Small (<100)',    stall_range:'15–30' },
    { email:'events@charlessturt.sa.gov.au',       first_name:'Paul',  last_name:'Jackson',  org_name:'City of Charles Sturt',              suburb:'Hindmarsh',     state:'SA', website:'charlessturt.sa.gov.au',         phone:'(08) 8408 1111', bio:'Twilight beach markets on Henley Square with live music.',           event_types:'["Twilight Market"]',                 event_scale:'Medium (100–500)',stall_range:'12–20' },
  ]) {
    await _su.run({ email: o.email, hash: HASH, first_name: o.first_name, last_name: o.last_name, role: 'organiser', status: 'active' });
    const row = await _uid.get(o.email);
    if (row) await _so.run({ user_id: row.id, org_name: o.org_name, suburb: o.suburb, state: o.state, bio: o.bio, website: o.website, phone: o.phone, event_types: o.event_types, event_scale: o.event_scale, stall_range: o.stall_range });
  }
}


// Ensure leroy.anton@yahoo.com and polarfruit@outlook.com accounts are always active.
for (const email of ['leroy.anton@yahoo.com', 'polarfruit@outlook.com']) {
  await _safeExec(`UPDATE users SET status='active' WHERE email='${email}' AND status != 'active'`);
}

// Link seed events to their organiser accounts by matching organiser_name → org_name.
// Runs unconditionally so it also repairs any existing rows with organiser_user_id=null.
await _safeExec(`
  UPDATE events
  SET organiser_user_id = (
    SELECT o.user_id FROM organisers o WHERE o.org_name = events.organiser_name LIMIT 1
  )
  WHERE organiser_user_id IS NULL
`);

// Also link events created by leroy.anton or polarfruit organiser accounts where the link is missing.
await _safeExec(`
  UPDATE events
  SET organiser_user_id = (
    SELECT u.id FROM users u WHERE u.email IN ('leroy.anton@yahoo.com','polarfruit@outlook.com') AND u.role='organiser' LIMIT 1
  )
  WHERE organiser_user_id IS NULL
`);

// Fallback: if name-match found nothing, assign any available organiser so messaging works.
await _safeExec(`
  UPDATE events
  SET organiser_user_id = (SELECT user_id FROM organisers LIMIT 1)
  WHERE organiser_user_id IS NULL
`);

// ── Data cleanup / fixups ─────────────────────────────────────────────────────
// Remove obviously fake test organiser+user accounts
await _safeExec(`DELETE FROM organisers WHERE email IN ('test@test.com.au','test@test') OR org_name IN ('test','testtest1!')`);
await _safeExec(`DELETE FROM users WHERE email IN ('test@test.com.au','test@test')`);
// Fix seed org name typo
await _safeExec(`UPDATE organisers SET org_name='SA Showground Events' WHERE org_name='Test SA Showground Events'`);
// Add delivery column to announcements for richer history
await _safeExec(`ALTER TABLE announcements ADD COLUMN delivery TEXT NOT NULL DEFAULT 'inapp'`);
// Backfill users.created_at — spread seed accounts across March 1–20 2026 based on id
await _safeExec(`UPDATE users SET created_at=datetime('2026-03-0'||((abs(id)%14)+1)||'T10:00:00') WHERE created_at=0 OR created_at IS NULL OR created_at='0'`);
await _safeExec(`UPDATE users SET created_at='2026-03-18 11:00:00' WHERE email='leroy.anton@yahoo.com'`);

// ── Platform settings key-value store ─────────────────────────────────────────
await _safeExec(`CREATE TABLE IF NOT EXISTS platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`);
// Seed defaults (INSERT OR IGNORE = no-op if already set)
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_pro_apps','1')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_messaging','1')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_reviews','1')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_org_signups','1')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_maintenance','0')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_auto_approve','0')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('flag_manual_org_review','1')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('banner_message','')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('banner_show','1')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('limit_free_apps','3')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('limit_pro_apps','0')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('limit_events_per_org','50')`);
await _safeExec(`INSERT OR IGNORE INTO platform_settings (key,value) VALUES ('limit_stalls_per_event','200')`);

// ── Announcement read tracking ──────────────────────────────────────────────
await _safeExec(`CREATE TABLE IF NOT EXISTS announcement_reads (
  user_id         INTEGER NOT NULL,
  announcement_id INTEGER NOT NULL,
  read_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, announcement_id)
)`);

// ── OAuth columns on users ──────────────────────────────────────────────────
await _safeExec(`ALTER TABLE users ADD COLUMN oauth_provider TEXT`);       // 'google' | 'apple' | null
await _safeExec(`ALTER TABLE users ADD COLUMN oauth_sub TEXT`);            // provider's unique subject ID

// ── Force-verified flag on users (admin override) ────────────────────────────
await _safeExec(`ALTER TABLE users ADD COLUMN force_verified INTEGER DEFAULT 0`);

// ── Mark schema as current so migrations are skipped on next boot ─────────────
await _safeExec(`CREATE TABLE IF NOT EXISTS _schema_meta (v INTEGER)`);
await _safeExec(`DELETE FROM _schema_meta`);
await _safeExec(`INSERT INTO _schema_meta (v) VALUES (${SCHEMA_VERSION})`);

} // end if (_schemaVersion < SCHEMA_VERSION)

// ── Always: ensure admin user row exists (id=1000, role='admin') ─────────────
// Admin lives in the users table like every other role. Row is pinned at
// id=1000 so the admin_user_id references scattered through serve.mjs remain
// valid FKs. On fresh install → INSERT with real bcrypt hash. On installs
// still carrying the legacy '$2b$08$unusable_hash_admin' placeholder from
// earlier commits → UPDATE to a usable hash. Once a real hash is in place,
// this block is a no-op and bcrypt.hash is not invoked.
const _LEGACY_UNUSABLE_ADMIN_HASH = '$2b$08$unusable_hash_admin';
const _adminRow = await prepare(`SELECT id, password_hash FROM users WHERE id = 1000`).get();
const _needsAdminSeed = !_adminRow || _adminRow.password_hash === _LEGACY_UNUSABLE_ADMIN_HASH;
if (_needsAdminSeed) {
  const _seedPassword = process.env.ADMIN_PASSWORD || 'ChangePitchAdminNow!';
  if (!process.env.ADMIN_PASSWORD) {
    console.error(
      '[db] CRITICAL: seeding admin user with default password "ChangePitchAdminNow!" — rotate immediately via direct DB update.'
    );
  }
  const _adminHash = await bcryptjs.hash(_seedPassword, 10);
  if (_adminRow) {
    await prepare(`UPDATE users SET password_hash = ? WHERE id = 1000`).run(_adminHash);
  } else {
    await prepare(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, email_verified)
       VALUES (1000, 'admin@onpitch.com.au', ?, 'Admin', 'Pitch', 'admin', 'active', 1)`
    ).run(_adminHash);
  }
}

// ── Always: ensure every vendor user has a vendors row (idempotent) ──────────
// Runs on every cold start — INSERT OR IGNORE is a no-op when record exists.
await _safeExec(`
  INSERT OR IGNORE INTO vendors (user_id, trading_name, cuisine_tags, plan)
  SELECT u.id, u.first_name||' '||u.last_name, '[]', 'free'
  FROM users u
  WHERE u.role='vendor'
    AND NOT EXISTS (SELECT 1 FROM vendors WHERE user_id=u.id)
`);

// ── Suspension feature migrations (idempotent, outside version gate) ─────────
await _safeExec(`ALTER TABLE users ADD COLUMN suspended_reason TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN suspended_by_admin INTEGER NOT NULL DEFAULT 0`);

// ── Document verification migrations (idempotent, outside version gate) ──────
// These five columns were originally added inside the version gate
// (lines 390-394). DBs stamped at schema_version=20 before those lines
// existed skip them forever. _ensureColumn checks PRAGMA table_info first
// and only ALTERs when the column is actually missing, logging when it
// adds so operators can see the heal happen in server boot logs.
async function _ensureColumn(table, column, typeSql) {
  let existingColumns;
  try {
    if (process.env.TURSO_DATABASE_URL) {
      const r = await _client.execute(`PRAGMA table_info(${table})`);
      existingColumns = r.rows.map(row => row.name);
    } else {
      existingColumns = _localDb
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map(row => row.name);
    }
  } catch (e) {
    console.error(`[db] _ensureColumn PRAGMA failed for ${table}:`, e.message);
    return false;
  }
  if (existingColumns.includes(column)) return false;
  try {
    if (process.env.TURSO_DATABASE_URL) {
      await _client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
    } else {
      _localDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
    }
    console.log(`[db] Added column ${table}.${column}`);
    return true;
  } catch {
    // Column was added between the PRAGMA and the ALTER — safe to ignore
    return false;
  }
}

await _ensureColumn('vendors', 'food_safety_status',           "TEXT DEFAULT 'none'");
await _ensureColumn('vendors', 'council_status',               "TEXT DEFAULT 'none'");
await _ensureColumn('vendors', 'pli_rejection_reason',         'TEXT');
await _ensureColumn('vendors', 'food_safety_rejection_reason', 'TEXT');
await _ensureColumn('vendors', 'council_rejection_reason',     'TEXT');

// ── FK heal for stale _users_old references (idempotent, outside gate) ───────
// Mirrors the heal at lines 661-679. That heal was inside the version gate,
// so any local DB already at schema_version=20 retained stale refs until
// patched by hand. Running here on every boot makes it self-healing. Turso's
// libsql client does not support writable_schema, so this stays local-only.
if (!process.env.TURSO_DATABASE_URL && _localDb) {
  try {
    const brokenCount = _localDb.prepare(
      `SELECT COUNT(*) as n FROM sqlite_master WHERE sql LIKE '%"_users_old"%'`
    ).get()?.n || 0;
    if (brokenCount > 0) {
      _localDb.pragma('writable_schema=1');
      _localDb.prepare(
        `UPDATE sqlite_master SET sql=REPLACE(sql,'"_users_old"','"users"') WHERE sql LIKE '%"_users_old"%'`
      ).run();
      _localDb.pragma('writable_schema=0');
      console.log('[db] Healed FK references from _users_old → users (post-gate)');
    }
  } catch (e) { console.error('[db] FK heal (post-gate) failed:', e.message); }
}

await _safeExec(`
  CREATE TABLE IF NOT EXISTS admin_audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id   INTEGER,
    action          TEXT NOT NULL,
    target_user_id  INTEGER NOT NULL,
    target_role     TEXT,
    reason          TEXT,
    metadata        TEXT,
    created_at      DATETIME DEFAULT (datetime('now'))
  )
`);

// ── Reports table ────────────────────────────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS reports (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    type               TEXT NOT NULL CHECK(type IN ('vendor-complaint','organiser-complaint','content')),
    status             TEXT NOT NULL DEFAULT 'open'
                       CHECK(status IN ('open','info-requested','resolved','dismissed')),
    ref_number         INTEGER UNIQUE NOT NULL,
    reporter_name      TEXT NOT NULL,
    reporter_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reporter_email     TEXT,
    against_name       TEXT NOT NULL,
    against_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body               TEXT NOT NULL,
    event_name         TEXT,
    resolved_by        TEXT,
    resolved_at        DATETIME,
    info_requested_at  DATETIME,
    created_at         DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_ref ON reports(ref_number)`);

// Seed the 3 hardcoded reports once (by ref_number uniqueness) — use real vendor/org names
await _safeExec(`INSERT OR IGNORE INTO reports (type,status,ref_number,reporter_name,against_name,body,event_name,created_at) VALUES
  ('vendor-complaint','open',1048,'Adelaide City Council Events','Smoky Joe''s BBQ','Smoky Joe''s BBQ allegedly misrepresented their menu and setup at the Rundle Mall Night Eats event. Organiser reports vendor set up outside allocated zone and sold items not listed on application.','Rundle Mall Night Eats','2026-03-07 10:00:00'),
  ('organiser-complaint','open',1047,'Smoky Joe''s BBQ','Adelaide City Council Events','Smoky Joe''s BBQ reports that their application to Rundle Mall Night Eats was rejected despite meeting all stated requirements. No reason was given by the organiser.',NULL,'2026-03-06 10:00:00'),
  ('content','open',1046,'Taco Loco','Adelaide Fringe Festival','Event listing "Fringe Food Village 2026" contains misleading information — advertised vendor spots as free but a $120 stall fee was charged on arrival. Multiple vendors flagged this.','Fringe Food Village 2026','2026-03-05 10:00:00'),
  ('vendor-complaint','resolved',1045,'City of Holdfast Bay','Duplicate listing','Duplicate event listing for "Glenelg Summer Sundowner" removed. Original listing retained.',NULL,'2026-03-03 10:00:00')
`);
// Fix any stale against_name values from old seeds that don't match real users
await _safeExec(`UPDATE reports SET against_name='Smoky Joe''s BBQ' WHERE ref_number=1048 AND against_name NOT IN (SELECT trading_name FROM vendors)`);
await _safeExec(`UPDATE reports SET against_name='Adelaide City Council Events' WHERE ref_number=1047 AND against_name NOT IN (SELECT org_name FROM organisers)`);
await _safeExec(`UPDATE reports SET against_name='Adelaide Fringe Festival' WHERE ref_number=1046 AND against_name NOT IN (SELECT trading_name FROM vendors) AND against_name NOT IN (SELECT org_name FROM organisers)`);

// Backfill against_user_id for reports where against_name matches a vendor trading_name or org name
await _safeExec(`UPDATE reports SET against_user_id = (SELECT v.user_id FROM vendors v WHERE LOWER(v.trading_name)=LOWER(reports.against_name) LIMIT 1) WHERE against_user_id IS NULL AND against_name IS NOT NULL`);
await _safeExec(`UPDATE reports SET against_user_id = (SELECT o.user_id FROM organisers o WHERE LOWER(o.org_name)=LOWER(reports.against_name) LIMIT 1) WHERE against_user_id IS NULL AND against_name IS NOT NULL`);
// Backfill reporter_user_id similarly
await _safeExec(`UPDATE reports SET reporter_user_id = (SELECT v.user_id FROM vendors v WHERE LOWER(v.trading_name)=LOWER(reports.reporter_name) LIMIT 1) WHERE reporter_user_id IS NULL AND reporter_name IS NOT NULL`);
await _safeExec(`UPDATE reports SET reporter_user_id = (SELECT o.user_id FROM organisers o WHERE LOWER(o.org_name)=LOWER(reports.reporter_name) LIMIT 1) WHERE reporter_user_id IS NULL AND reporter_name IS NOT NULL`);

// ── Subscription override migrations ─────────────────────────────────────────
await _safeExec(`ALTER TABLE vendors ADD COLUMN plan_override INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN plan_override_by INTEGER`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN plan_override_at DATETIME`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN plan_override_reason TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN plan_override_expires DATETIME`);
await _safeExec(`
  CREATE TABLE IF NOT EXISTS subscription_changes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_plan         TEXT NOT NULL,
    new_plan         TEXT NOT NULL,
    changed_by       TEXT NOT NULL CHECK(changed_by IN ('admin','vendor','system')),
    admin_user_id    INTEGER,
    reason           TEXT,
    payment_status   TEXT,
    is_override      INTEGER NOT NULL DEFAULT 0,
    override_expires DATETIME,
    created_at       DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_sub_changes_user ON subscription_changes(user_id)`);

// ── Post-event completion workflow ───────────────────────────────────────────
await _safeExec(`ALTER TABLE events ADD COLUMN completed_at DATETIME`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN notif_post_event INTEGER NOT NULL DEFAULT 1`);
await _safeExec(`
  CREATE TABLE IF NOT EXISTS event_completion_notifications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_role       TEXT NOT NULL CHECK(user_role IN ('organiser','vendor')),
    notif_type      TEXT NOT NULL DEFAULT 'rate_prompt',
    sent_via_email  INTEGER NOT NULL DEFAULT 0,
    created_at      DATETIME DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id, notif_type)
  )
`);

// ── Vendor extended settings migrations ──────────────────────────────────────
await _safeExec(`ALTER TABLE vendors ADD COLUMN default_apply_message TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN timezone TEXT DEFAULT 'Australia/Adelaide'`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN invoice_business_name TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN invoice_address TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN hide_phone INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN hide_abn INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN hide_reviews INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN stripe_customer_id TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN stripe_subscription_id TEXT`);
await _safeExec(`ALTER TABLE stall_fees ADD COLUMN stripe_payment_intent_id TEXT`);
await _safeExec(`ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN updated_at DATETIME`);

// ── Event creation — extra fields from Steps 2-4 ────────────────────────────
await _safeExec(`ALTER TABLE events ADD COLUMN booth_size TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN setup_time TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN packdown_time TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN power_available INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE events ADD COLUMN power_amps TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN water_available INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE events ADD COLUMN cuisines_wanted TEXT DEFAULT '[]'`);
await _safeExec(`ALTER TABLE events ADD COLUMN exclusivity INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE events ADD COLUMN looking_for TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN custom_requirements TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN cancel_policy TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN payment_terms TEXT`);

// ── Organiser extended settings ─────────────────────────────────────────────
await _safeExec(`ALTER TABLE organisers ADD COLUMN default_stall_fee_min INTEGER`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN default_stall_fee_max INTEGER`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN default_spots INTEGER`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN default_booth_size TEXT`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN default_power INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN default_water INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN timezone TEXT DEFAULT 'Australia/Adelaide'`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN auto_response_template TEXT`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN banner_url TEXT`);
await _safeExec(`ALTER TABLE organisers ADD COLUMN time_format TEXT DEFAULT '12'`);

// ── User last_active tracking ───────────────────────────────────────────────
await _safeExec(`ALTER TABLE users ADD COLUMN last_active DATETIME`);

// ── Rejected status migration (users.status CHECK must include 'rejected') ──
{
  let _rejSchema = '';
  try {
    if (process.env.TURSO_DATABASE_URL) {
      const r = await _client.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`);
      _rejSchema = (r.rows[0]?.sql) || '';
    } else {
      const row = _localDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get();
      _rejSchema = (row?.sql) || '';
    }
  } catch {}
  if (_rejSchema && !_rejSchema.includes("'rejected'")) {
    const migSQL = `
      ALTER TABLE users RENAME TO _users_old;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('vendor','organiser','admin','foodie')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','banned','rejected')),
        email_verified INTEGER NOT NULL DEFAULT 0,
        phone_verified INTEGER NOT NULL DEFAULT 0,
        oauth_provider TEXT,
        oauth_sub TEXT,
        force_verified INTEGER DEFAULT 0,
        suspended_reason TEXT,
        two_factor_enabled INTEGER NOT NULL DEFAULT 0,
        last_active DATETIME,
        created_at DATETIME DEFAULT (datetime('now')),
        avatar_url TEXT
      );
      INSERT INTO users SELECT * FROM _users_old;
      DROP TABLE _users_old;
    `;
    try {
      if (process.env.TURSO_DATABASE_URL) {
        await _client.execute('PRAGMA foreign_keys=OFF');
        await _client.executeMultiple(migSQL);
        await _client.execute('PRAGMA foreign_keys=ON');
      } else {
        _localDb.pragma('foreign_keys=OFF');
        _localDb.exec(migSQL);
        _localDb.pragma('foreign_keys=ON');
      }
    } catch (e) { console.error('[db] Rejected status migration failed:', e); }
  }
}

// ── Team members table ──────────────────────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS organiser_team_members (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    organiser_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    email             TEXT NOT NULL,
    role              TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('editor','viewer')),
    status            TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
    invited_at        DATETIME DEFAULT (datetime('now')),
    accepted_at       DATETIME,
    UNIQUE(organiser_user_id, email)
  )
`);

await _safeExec(`
  CREATE TABLE IF NOT EXISTS contact_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    role       TEXT NOT NULL,
    subject    TEXT NOT NULL,
    message    TEXT NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now'))
  )
`);

// ── Password reset tokens (idempotent) ──────────────────────────────────────
await _safeExec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// ── Prepared statements ──────────────────────────────────────────────────────
export const stmts = {
  // users
  createUser:      prepare(`INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`),
  createOAuthUser: prepare(`INSERT INTO users (email,password_hash,first_name,last_name,role,oauth_provider,oauth_sub,status,email_verified) VALUES (@email,'__oauth__',@first_name,@last_name,@role,@oauth_provider,@oauth_sub,'active',1)`),
  getUserByEmail:    prepare(`SELECT * FROM users WHERE email = ?`),
  getUserById:       prepare(`SELECT * FROM users WHERE id = ?`),
  getUserByOAuth:    prepare(`SELECT * FROM users WHERE oauth_provider = ? AND oauth_sub = ?`),
  setUserStatus:     prepare(`UPDATE users SET status = ? WHERE id = ?`),
  setUserOAuth:      prepare(`UPDATE users SET oauth_provider = ?, oauth_sub = ? WHERE id = ?`),

  // vendors
  createVendor: prepare(`
    INSERT INTO vendors (user_id,trading_name,abn,abn_verified,mobile,state,suburb,bio,
      cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan)
    VALUES (@user_id,@trading_name,@abn,@abn_verified,@mobile,@state,@suburb,@bio,
      @cuisine_tags,@setup_type,@stall_w,@stall_d,@power,@water,@price_range,@instagram,@plan)
  `),
  getVendorByUserId:  prepare(`SELECT * FROM vendors WHERE user_id = ?`),
  getVendorByStripeCustomerId: prepare(`SELECT * FROM vendors WHERE stripe_customer_id = ?`),
  updateVendorPlan:   prepare(`UPDATE vendors SET plan = ? WHERE user_id = ?`),
  updateVendorStripe: prepare(`UPDATE vendors SET stripe_customer_id = @stripe_customer_id, stripe_subscription_id = @stripe_subscription_id WHERE user_id = @user_id`),
  clearVendorStripeSubscription: prepare(`UPDATE vendors SET stripe_subscription_id = NULL, plan = 'free' WHERE user_id = ?`),
  allVendors: prepare(`SELECT u.id as user_id, COALESCE(v.trading_name, u.first_name||' '||u.last_name) as trading_name, u.email, u.first_name, u.last_name, u.status, u.created_at as joined, v.abn, v.abn_verified, v.abn_match, v.abn_entity_name, COALESCE(v.plan,'free') as plan, v.plan_override, v.suburb, v.state, v.id as vid, v.created_at, v.food_safety_url, v.pli_url, v.council_url FROM users u LEFT JOIN vendors v ON v.user_id=u.id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=u.id) WHERE u.role='vendor' ORDER BY u.id DESC`),
  vendorsByStatus: prepare(`SELECT u.id as user_id, COALESCE(v.trading_name, u.first_name||' '||u.last_name) as trading_name, u.email, u.first_name, u.last_name, u.status, u.created_at as joined, v.abn, v.abn_verified, v.abn_match, v.abn_entity_name, COALESCE(v.plan,'free') as plan, v.plan_override, v.suburb, v.state, v.id as vid, v.created_at, v.food_safety_url, v.pli_url, v.council_url FROM users u LEFT JOIN vendors v ON v.user_id=u.id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=u.id) WHERE u.role='vendor' AND u.status=? ORDER BY u.id DESC`),

  // organisers
  createOrganiser: prepare(`
    INSERT INTO organisers (user_id,org_name,abn,abn_verified,website,state,suburb,phone,bio,
      event_types,event_scale,stall_range,referral)
    VALUES (@user_id,@org_name,@abn,@abn_verified,@website,@state,@suburb,@phone,@bio,
      @event_types,@event_scale,@stall_range,@referral)
  `),
  getOrganiserByUserId: prepare(`SELECT * FROM organisers WHERE user_id = ?`),
  getOrgWithAvatar:     prepare(`SELECT o.abn_verified, u.avatar_url FROM organisers o JOIN users u ON u.id=o.user_id WHERE o.user_id=?`),
  getOrganiserByName:   prepare(`SELECT * FROM organisers WHERE org_name = ? LIMIT 1`),
  allOrganisers: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.created_at as joined FROM organisers o JOIN users u ON o.user_id=u.id WHERE o.id IN (SELECT MIN(id) FROM organisers GROUP BY user_id) ORDER BY o.created_at DESC`),
  organisersByStatus: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.created_at as joined FROM organisers o JOIN users u ON o.user_id=u.id WHERE o.id IN (SELECT MIN(id) FROM organisers GROUP BY user_id) AND u.status=? ORDER BY o.created_at DESC`),

  // admin actions
  updateUserAvatar:                prepare(`UPDATE users SET avatar_url=? WHERE id=?`),
  updateUserStatus:                prepare(`UPDATE users SET status=? WHERE id=?`),
  setSuspendedReason:              prepare(`UPDATE users SET suspended_reason=? WHERE id=?`),

  // suspension side-effects
  withdrawVendorPendingApps: prepare(`UPDATE event_applications SET status='withdrawn', updated_at=datetime('now') WHERE vendor_user_id=? AND status='pending'`),
  getVendorApprovedApps: prepare(`
    SELECT ea.id, ea.event_id, e.name as event_name, e.organiser_user_id,
           COALESCE(o.org_name, e.organiser_name) as organiser_name,
           ou.email as organiser_email
    FROM event_applications ea
    JOIN events e ON ea.event_id=e.id
    LEFT JOIN organisers o ON o.user_id=e.organiser_user_id
    LEFT JOIN users ou ON ou.id=e.organiser_user_id
    WHERE ea.vendor_user_id=? AND ea.status='approved'
  `),
  suspendOrgEvents: prepare(`UPDATE events SET status='archived',suspended_by_admin=1 WHERE organiser_user_id=? AND status='published'`),
  reinstateOrgEvents: prepare(`UPDATE events SET status='published',suspended_by_admin=0 WHERE organiser_user_id=? AND suspended_by_admin=1`),
  getConfirmedVendorsAtOrgEvents: prepare(`
    SELECT DISTINCT ea.vendor_user_id, u.email as vendor_email, u.first_name,
           COALESCE(v.trading_name, u.first_name||' '||u.last_name) as trading_name,
           e.name as event_name, e.id as event_id
    FROM events e
    JOIN event_applications ea ON ea.event_id=e.id AND ea.status='approved'
    JOIN users u ON u.id=ea.vendor_user_id
    LEFT JOIN vendors v ON v.user_id=u.id
    WHERE e.organiser_user_id=?
  `),
  insertAuditLog: prepare(`INSERT INTO admin_audit_log (admin_user_id,action,target_user_id,target_role,reason,metadata) VALUES (@admin_user_id,@action,@target_user_id,@target_role,@reason,@metadata)`),
  getAuditLog:    prepare(`SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 100`),

  // suspension health stats
  countSuspendedVendors:              prepare(`SELECT COUNT(*) as n FROM users WHERE role='vendor' AND status='suspended'`),
  countSuspendedOrgs:                 prepare(`SELECT COUNT(*) as n FROM users WHERE role='organiser' AND status='suspended'`),
  countHiddenByOrgSuspension:         prepare(`SELECT COUNT(*) as n FROM events WHERE suspended_by_admin=1`),
  countVendorsAffectedBySuspension:   prepare(`SELECT COUNT(DISTINCT ea.vendor_user_id) as n FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.suspended_by_admin=1 AND ea.status='approved'`),
  updateUserPassword:              prepare(`UPDATE users SET password_hash=? WHERE id=?`),

  // password reset
  createPasswordResetToken: prepare(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES (?, ?, datetime('now', '+1 hour'))
  `),
  getPasswordResetToken: prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `),
  markPasswordResetTokenUsed: prepare(`
    UPDATE password_reset_tokens SET used = 1 WHERE token = ?
  `),
  deleteOtherPasswordResetTokensForUser: prepare(`
    DELETE FROM password_reset_tokens
    WHERE user_id = ? AND token != ?
  `),

  touchUserActive:                 prepare(`UPDATE users SET last_active=datetime('now') WHERE id=?`),
  deleteUser:                      prepare(`DELETE FROM users WHERE id=?`),
  deleteVendorByUserId:            prepare(`DELETE FROM vendors WHERE user_id=?`),
  deleteOrganiserByUserId:         prepare(`DELETE FROM organisers WHERE user_id=?`),
  deleteVerificationCodesByUserId: prepare(`DELETE FROM verification_codes WHERE user_id=?`),
  deletePaymentsByUserId:          prepare(`DELETE FROM payments WHERE user_id=?`),

  // counts
  countVendors:    prepare(`SELECT COUNT(*) as n FROM users WHERE role='vendor'`),
  countOrganisers: prepare(`SELECT COUNT(*) as n FROM users WHERE role='organiser'`),
  countPending:    prepare(`SELECT COUNT(*) as n FROM users WHERE status='pending'`),
  countApplications: prepare(`SELECT status, COUNT(*) as n FROM event_applications GROUP BY status`),
  // 7-day rolling window deltas
  newVendors7d:    prepare(`SELECT COUNT(*) as n FROM users WHERE role='vendor'    AND created_at >= datetime('now','-7 days')`),
  newOrgs7d:       prepare(`SELECT COUNT(*) as n FROM users WHERE role='organiser' AND created_at >= datetime('now','-7 days')`),
  newApps7d:       prepare(`SELECT COUNT(*) as n FROM event_applications WHERE created_at >= datetime('now','-7 days')`),
  newAppsPrior7d:  prepare(`SELECT COUNT(*) as n FROM event_applications WHERE created_at >= datetime('now','-14 days') AND created_at < datetime('now','-7 days')`),
  // Per-day signup counts for the rolling 7-day chart
  signups7dByDay:  prepare(`SELECT date(created_at) as day, COUNT(*) as n FROM users WHERE created_at >= date('now','-6 days') GROUP BY date(created_at) ORDER BY day ASC`),

  // ── Extended analytics ──────────────────────────────────────────────────────

  // Revenue & Plans
  totalRevenue:      prepare(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE status='paid'`),
  revenueThisMonth:  prepare(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE status='paid' AND created_at >= date('now','start of month')`),
  revenueLastMonth:  prepare(`SELECT COALESCE(SUM(amount),0) as n FROM payments WHERE status='paid' AND created_at >= date('now','start of month','-1 month') AND created_at < date('now','start of month')`),
  avgTransaction:    prepare(`SELECT COALESCE(ROUND(AVG(amount),2),0) as n FROM payments WHERE status='paid'`),
  revenueByMonth:    prepare(`SELECT strftime('%Y-%m',created_at) as month, COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid' AND created_at >= date('now','-5 months','start of month') GROUP BY strftime('%Y-%m',created_at) ORDER BY month ASC`),
  vendorsByPlan:     prepare(`SELECT COALESCE(v.plan,'free') as plan, COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' GROUP BY v.plan ORDER BY CASE COALESCE(v.plan,'free') WHEN 'growth' THEN 1 WHEN 'pro' THEN 2 WHEN 'basic' THEN 3 ELSE 4 END`),

  // Growth trends
  signups30dByDay:   prepare(`SELECT date(created_at) as day, role, COUNT(*) as n FROM users WHERE created_at >= date('now','-29 days') GROUP BY date(created_at), role ORDER BY day ASC`),
  growthVendorsThisMonth:  prepare(`SELECT COUNT(*) as n FROM users WHERE role='vendor' AND created_at >= date('now','start of month')`),
  growthVendorsLastMonth:  prepare(`SELECT COUNT(*) as n FROM users WHERE role='vendor' AND created_at >= date('now','start of month','-1 month') AND created_at < date('now','start of month')`),
  growthOrgsThisMonth:     prepare(`SELECT COUNT(*) as n FROM users WHERE role='organiser' AND created_at >= date('now','start of month')`),
  growthOrgsLastMonth:     prepare(`SELECT COUNT(*) as n FROM users WHERE role='organiser' AND created_at >= date('now','start of month','-1 month') AND created_at < date('now','start of month')`),
  growthEventsThisMonth:   prepare(`SELECT COUNT(*) as n FROM events WHERE status='published' AND created_at >= date('now','start of month')`),
  growthEventsLastMonth:   prepare(`SELECT COUNT(*) as n FROM events WHERE status='published' AND created_at >= date('now','start of month','-1 month') AND created_at < date('now','start of month')`),
  growthAppsThisMonth:     prepare(`SELECT COUNT(*) as n FROM event_applications WHERE created_at >= date('now','start of month')`),
  growthAppsLastMonth:     prepare(`SELECT COUNT(*) as n FROM event_applications WHERE created_at >= date('now','start of month','-1 month') AND created_at < date('now','start of month')`),

  // Event performance
  eventFillRates:    prepare(`SELECT e.id, e.name, e.date_sort, COALESCE(e.stalls_available,0) as stalls_available, COUNT(CASE WHEN ea.status='approved' THEN 1 END) as approved_count, COUNT(ea.id) as total_apps FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.status='published' GROUP BY e.id ORDER BY CASE WHEN e.stalls_available > 0 THEN ROUND(COUNT(CASE WHEN ea.status='approved' THEN 1 END)*100.0/e.stalls_available,0) ELSE 0 END DESC LIMIT 10`),
  avgStallFee:       prepare(`SELECT ROUND(AVG((COALESCE(stall_fee_min,0)+COALESCE(stall_fee_max,0))/2.0),0) as n FROM events WHERE status='published' AND (stall_fee_min>0 OR stall_fee_max>0)`),
  avgAppsPerEvent:   prepare(`SELECT ROUND(CAST(total_apps AS REAL)/CASE WHEN total_events=0 THEN 1 ELSE total_events END,1) as n FROM (SELECT COUNT(ea.id) as total_apps, COUNT(DISTINCT e.id) as total_events FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.status='published')`),

  // Geography
  eventsBySuburb:    prepare(`SELECT COALESCE(suburb,'Unknown') as suburb, COUNT(*) as n FROM events WHERE status='published' GROUP BY suburb ORDER BY n DESC LIMIT 10`),
  vendorsBySuburb:   prepare(`SELECT COALESCE(v.suburb,'Unknown') as suburb, COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND u.status='active' GROUP BY v.suburb ORDER BY n DESC LIMIT 10`),

  // Platform health
  openReports:       prepare(`SELECT COUNT(*) as n FROM reports WHERE status='open'`),
  openFlags:         prepare(`SELECT COUNT(*) as n FROM content_flags WHERE status='pending'`),
  avgResolutionTime: prepare(`SELECT ROUND(AVG((julianday(resolved_at)-julianday(created_at))*24),1) as n FROM reports WHERE resolved_at IS NOT NULL`),
  messagesTotal:     prepare(`SELECT COUNT(*) as n FROM messages`),
  messages7d:        prepare(`SELECT COUNT(*) as n FROM messages WHERE created_at >= date('now','-7 days')`),
  docCompliance:     prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN food_safety_url IS NOT NULL AND food_safety_url!='' THEN 1 ELSE 0 END) as has_food_safety, SUM(CASE WHEN pli_url IS NOT NULL AND pli_url!='' THEN 1 ELSE 0 END) as has_pli, SUM(CASE WHEN council_url IS NOT NULL AND council_url!='' THEN 1 ELSE 0 END) as has_council FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.status='active' AND u.role='vendor'`),

  // Real funnels
  vendorsWithApprovedApp:  prepare(`SELECT COUNT(DISTINCT vendor_user_id) as n FROM event_applications WHERE status='approved'`),
  vendorsPaidPlan:         prepare(`SELECT COUNT(*) as n FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.role='vendor' AND v.plan IN ('pro','growth')`),
  organisersWithEvent:     prepare(`SELECT COUNT(DISTINCT organiser_user_id) as n FROM events WHERE status='published' AND organiser_user_id IS NOT NULL`),
  organisersWithApps:      prepare(`SELECT COUNT(DISTINCT e.organiser_user_id) as n FROM events e JOIN event_applications ea ON ea.event_id=e.id WHERE e.status='published'`),

  // Top vendors
  topVendorsByApps:  prepare(`SELECT v.trading_name, COUNT(ea.id) as total_apps, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved FROM event_applications ea JOIN vendors v ON v.user_id=ea.vendor_user_id GROUP BY ea.vendor_user_id ORDER BY total_apps DESC LIMIT 5`),

  // Activity feed — 6 most recent events across signups, applications, events published
  recentActivity: prepare(`
    SELECT type, actor_name, subject_name, status, ts FROM (
      SELECT 'signup'      AS type,
             first_name||' '||last_name AS actor_name,
             role          AS subject_name,
             status,
             created_at    AS ts
        FROM users
       WHERE created_at IS NOT NULL AND created_at != '' AND created_at != '0'
      UNION ALL
      SELECT 'application' AS type,
             COALESCE(v.trading_name, u.first_name||' '||u.last_name) AS actor_name,
             COALESCE(e.name, 'an event') AS subject_name,
             ea.status,
             ea.created_at AS ts
        FROM event_applications ea
        JOIN users u ON u.id = ea.vendor_user_id
        LEFT JOIN vendors v ON v.user_id = u.id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=u.id)
        LEFT JOIN events e ON e.id = ea.event_id
       WHERE ea.created_at IS NOT NULL
      UNION ALL
      SELECT 'event'       AS type,
             COALESCE(o.org_name, 'Unknown') AS actor_name,
             e.name        AS subject_name,
             e.status,
             e.created_at  AS ts
        FROM events e
        LEFT JOIN organisers o ON o.user_id = e.organiser_user_id
       WHERE e.created_at IS NOT NULL AND e.status='published'
    )
    ORDER BY ts DESC
    LIMIT 6
  `),

  // all users (admin)
  allUsers:    prepare(`SELECT id,email,first_name,last_name,role,status,email_verified,phone_verified,force_verified,created_at FROM users ORDER BY created_at DESC`),
  usersByRole: prepare(`SELECT id,email,first_name,last_name,role,status,email_verified,phone_verified,force_verified,created_at FROM users WHERE role=? ORDER BY created_at DESC`),
  updateUserRole: prepare(`UPDATE users SET role=? WHERE id=?`),

  // all applications (admin)
  allApplications:          prepare(`SELECT ea.id,ea.event_id,ea.vendor_user_id,ea.status,ea.message,ea.created_at,ea.spot_number,e.name as event_name,e.slug,e.category,e.date_sort,e.organiser_name,u.email as vendor_email,v.trading_name FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id ORDER BY ea.created_at DESC`),
  applicationsByStatus:     prepare(`SELECT ea.id,ea.event_id,ea.vendor_user_id,ea.status,ea.message,ea.created_at,ea.spot_number,e.name as event_name,e.slug,e.category,e.date_sort,e.organiser_name,u.email as vendor_email,v.trading_name FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id WHERE ea.status=? ORDER BY ea.created_at DESC`),

  // featured / homepage queries
  featuredEvents: prepare(`
    SELECT e.id,e.name,e.slug,e.category,e.suburb,e.state,e.date_sort,e.featured,
           e.stall_fee_min,e.stall_fee_max,e.deadline,e.stalls_available,e.date_text,e.cover_image,
           COUNT(ea.id) AS vendor_count
    FROM events e
    LEFT JOIN event_applications ea ON ea.event_id=e.id AND ea.status='approved'
    WHERE e.status='published' AND e.date_sort >= ?
    GROUP BY e.id
    ORDER BY e.featured DESC, e.featured_at DESC, e.date_sort ASC, vendor_count DESC LIMIT 6
  `),
  categoryCounts: prepare(`
    SELECT category, COUNT(*) AS count FROM events
    WHERE status='published' AND date_sort >= ? GROUP BY category
  `),
  recentPendingVendors: prepare(`
    SELECT u.id, v.trading_name, u.created_at
    FROM vendors v JOIN users u ON u.id=v.user_id
    WHERE u.status='pending' ORDER BY u.created_at DESC LIMIT 5
  `),
  recentPendingOrgs: prepare(`
    SELECT u.id, o.org_name, u.created_at
    FROM organisers o JOIN users u ON u.id=o.user_id
    WHERE u.status='pending' ORDER BY u.created_at DESC LIMIT 5
  `),
  featuredVendors:   prepare(`SELECT v.user_id,v.trading_name,v.cuisine_tags,v.suburb,v.state,v.featured,COALESCE(v.plan,'free') AS plan,v.setup_type,v.featured_at FROM vendors v JOIN users u ON v.user_id=u.id WHERE v.featured=1 AND u.status='active' ORDER BY v.featured_at DESC, v.trading_name ASC`),
  adminFeaturedEvents: prepare(`SELECT e.id,e.name,e.slug,e.category,e.suburb,e.state,e.date_sort,e.featured,e.featured_at FROM events e WHERE e.featured=1 AND e.status='published' ORDER BY e.featured_at DESC, e.date_sort ASC`),
  recommendedVendors: prepare(`
    SELECT v.user_id, v.trading_name, v.cuisine_tags, v.suburb, v.state,
           COALESCE(v.plan,'free') AS plan, v.featured,
           COUNT(DISTINCT ea.id) AS event_count
    FROM vendors v
    JOIN users u ON v.user_id=u.id
    LEFT JOIN event_applications ea ON ea.vendor_user_id=v.user_id AND ea.status='approved'
    WHERE u.status='active' AND v.featured=0
    GROUP BY v.user_id
    ORDER BY
      CASE COALESCE(v.plan,'free') WHEN 'growth' THEN 4 WHEN 'pro' THEN 3 WHEN 'basic' THEN 2 ELSE 1 END DESC,
      event_count DESC,
      v.trading_name ASC
  `),
  recommendedEvents: prepare(`
    SELECT e.id, e.name, e.category, e.suburb, e.state, e.date_sort, e.featured,
           o.org_name,
           COUNT(DISTINCT ea.id) AS app_count,
           (SELECT COUNT(*) FROM events e2 WHERE e2.organiser_user_id=e.organiser_user_id AND e2.status='published') AS org_event_count
    FROM events e
    LEFT JOIN organisers o ON o.user_id=e.organiser_user_id
    LEFT JOIN event_applications ea ON ea.event_id=e.id
    WHERE e.status='published' AND e.featured=0 AND e.date_sort >= date('now')
    GROUP BY e.id
    ORDER BY app_count DESC, org_event_count DESC, e.date_sort ASC
  `),
  setEventFeatured:  prepare(`UPDATE events SET featured=?, featured_at=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END WHERE id=?`),
  setVendorFeatured: prepare(`UPDATE vendors SET featured=?, featured_at=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END WHERE user_id=?`),
  renameEvent:       prepare(`UPDATE events SET name=? WHERE id=?`),
  renameVendor:      prepare(`UPDATE vendors SET trading_name=? WHERE user_id=?`),

  // events
  allEvents:         prepare(`SELECT * FROM events WHERE status != 'deleted' ORDER BY date_sort ASC`),
  publishedEvents:   prepare(`SELECT * FROM events WHERE status='published' ORDER BY date_sort ASC`),
  getEventBySlug:    prepare(`SELECT * FROM events WHERE slug=? AND status='published'`),
  getEventById:      prepare(`SELECT * FROM events WHERE id=?`),
  getApprovedVendorsByEvent: prepare(`SELECT v.user_id,v.trading_name,v.cuisine_tags,v.setup_type FROM event_applications ea JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE ea.event_id=? AND ea.status='approved' ORDER BY ea.approved_at ASC`),
  countOrgEvents:    prepare(`SELECT COUNT(*) as n FROM events WHERE organiser_user_id=? AND status='published'`),
  updateEventStatus: prepare(`UPDATE events SET status=? WHERE id=?`),
  updateEvent:       prepare(`UPDATE events SET name=@name,category=@category,suburb=@suburb,state=@state,venue_name=@venue_name,date_sort=@date_sort,date_end=@date_end,date_text=@date_text,description=@description,stalls_available=@stalls_available,stall_fee_min=@stall_fee_min,stall_fee_max=@stall_fee_max,deadline=@deadline,cover_image=@cover_image,organiser_name=@organiser_name WHERE id=@id`),
  deleteEvent:       prepare(`DELETE FROM events WHERE id=?`),
  countEvents:       prepare(`SELECT COUNT(*) as n FROM events WHERE status='published'`),
  countEventsByCategory: prepare(`SELECT COALESCE(category,'Other') as category, COUNT(*) as n FROM events WHERE status='published' GROUP BY category ORDER BY n DESC`),

  // vendor/organiser detail (admin)
  getVendorDetail:    prepare(`SELECT v.*,u.id as user_id,u.email,u.first_name,u.last_name,u.status,u.role,u.created_at FROM users u LEFT JOIN vendors v ON v.user_id=u.id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=u.id) WHERE u.id=? AND u.role='vendor'`),
  getOrganiserDetail: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.role,u.created_at FROM organisers o JOIN users u ON o.user_id=u.id WHERE o.user_id=?`),

  // payments
  getPaymentsByUser: prepare(`SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC`),
  createPayment:     prepare(`INSERT INTO payments (user_id,plan,amount,currency,status,description) VALUES (@user_id,@plan,@amount,@currency,@status,@description)`),

  // update profiles (admin)
  updateUserProfile:      prepare(`UPDATE users SET first_name=@first_name,last_name=@last_name,email=@email,status=@status WHERE id=@id`),
  updateVendorProfile:    prepare(`UPDATE vendors SET trading_name=@trading_name,mobile=@mobile,suburb=@suburb,state=@state,bio=@bio,instagram=@instagram,setup_type=@setup_type,stall_w=@stall_w,stall_d=@stall_d,power=@power,water=@water,price_range=@price_range,abn=@abn WHERE user_id=@user_id`),
  updateVendorProfileSelf: prepare(`UPDATE vendors SET trading_name=@trading_name,mobile=@mobile,suburb=@suburb,state=@state,bio=@bio,instagram=@instagram,abn=@abn,setup_type=@setup_type,stall_w=@stall_w,stall_d=@stall_d,power=@power,water=@water,price_range=@price_range,cuisine_tags=@cuisine_tags WHERE user_id=@user_id`),
  updateVendorPhotos:     prepare(`UPDATE vendors SET photos=@photos WHERE user_id=@user_id`),
  updateVendorDoc:        prepare(`UPDATE vendors SET food_safety_url=@food_safety_url,pli_url=@pli_url,council_url=@council_url WHERE user_id=@user_id`),
  updateVendorPliAnalysis: prepare(`UPDATE vendors SET pli_insured_name=@pli_insured_name,pli_policy_number=@pli_policy_number,pli_coverage_amount=@pli_coverage_amount,pli_expiry=@pli_expiry,pli_status=@pli_status,pli_analysed_at=datetime('now'),pli_flags=@pli_flags WHERE user_id=@user_id`),

  // document verification (admin)
  verifyPliDocument:         prepare(`UPDATE vendors SET pli_status='verified',pli_rejection_reason=NULL WHERE user_id=?`),
  verifyFoodSafetyDocument:  prepare(`UPDATE vendors SET food_safety_status='verified',food_safety_rejection_reason=NULL WHERE user_id=?`),
  verifyCouncilDocument:     prepare(`UPDATE vendors SET council_status='verified',council_rejection_reason=NULL WHERE user_id=?`),
  rejectPliDocument:         prepare(`UPDATE vendors SET pli_status='rejected',pli_rejection_reason=? WHERE user_id=?`),
  rejectFoodSafetyDocument:  prepare(`UPDATE vendors SET food_safety_status='rejected',food_safety_rejection_reason=? WHERE user_id=?`),
  rejectCouncilDocument:     prepare(`UPDATE vendors SET council_status='rejected',council_rejection_reason=? WHERE user_id=?`),

  updateVendorAbnVerification: prepare(`UPDATE vendors SET abn_verified=@abn_verified,abn_entity_name=@abn_entity_name,abn_match=@abn_match,abn_verified_at=datetime('now') WHERE user_id=@user_id`),
  updateOrganiserProfile: prepare(`UPDATE organisers SET org_name=@org_name,phone=@phone,website=@website,suburb=@suburb,state=@state,bio=@bio,event_scale=@event_scale,stall_range=@stall_range,abn=@abn WHERE user_id=@user_id`),
  updateOrganiserProfileSelf: prepare(`UPDATE organisers SET org_name=@org_name,bio=@bio,website=@website,abn=@abn WHERE user_id=@user_id`),
  updateOrganiserAbnVerification: prepare(`UPDATE organisers SET abn_verified=@abn_verified,abn_entity_name=@abn_entity_name,abn_match=@abn_match,abn_verified_at=datetime('now') WHERE user_id=@user_id`),

  // verification codes
  createVerificationCode: prepare(`INSERT INTO verification_codes (user_id,type,code,target,expires_at) VALUES (@user_id,@type,@code,@target,@expires_at)`),
  getVerificationCode:    prepare(`SELECT * FROM verification_codes WHERE user_id=? AND type=? AND used=0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`),
  markCodeUsed:           prepare(`UPDATE verification_codes SET used=1 WHERE id=?`),
  setEmailVerified:       prepare(`UPDATE users SET email_verified=1 WHERE id=?`),
  setPhoneVerified:       prepare(`UPDATE users SET phone_verified=1 WHERE id=?`),

  // presignup codes
  upsertPresignupCode:  prepare(`INSERT OR REPLACE INTO presignup_codes (email,code,expires,verified) VALUES (?,?,?,0)`),
  getPresignupCode:     prepare(`SELECT * FROM presignup_codes WHERE email=?`),
  setPresignupVerified: prepare(`UPDATE presignup_codes SET verified=1 WHERE email=?`),
  deletePresignupCode:  prepare(`DELETE FROM presignup_codes WHERE email=?`),

  // event applications
  createApplication:       prepare(`INSERT OR IGNORE INTO event_applications (event_id,vendor_user_id,message) VALUES (?,?,?)`),
  getApplicationById:      prepare(`SELECT * FROM event_applications WHERE id=?`),
  getApplicationByIds:     prepare(`SELECT * FROM event_applications WHERE event_id=? AND vendor_user_id=?`),
  getApplicationsByVendor: prepare(`SELECT ea.*,e.name as event_name,e.slug as event_slug,e.category,e.suburb,e.state,e.date_sort,e.date_text,e.organiser_name,e.organiser_user_id FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE ea.vendor_user_id=? ORDER BY ea.created_at DESC`),
  getApplicationsByEvent:  prepare(`SELECT ea.*,u.first_name,u.last_name,u.email,v.trading_name,v.mobile,v.suburb as v_suburb,v.state as v_state,v.bio,v.cuisine_tags,v.plan,v.instagram,v.setup_type,v.stall_w,v.stall_d,v.power,v.water,v.price_range FROM event_applications ea JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id WHERE ea.event_id=?`),
  updateApplicationStatus: prepare(`UPDATE event_applications SET status=?, updated_at=datetime('now') WHERE id=?`),
  setApplicationSpot:      prepare(`UPDATE event_applications SET spot_number=?,approved_at=datetime('now') WHERE id=?`),
  countApprovedByEvent:    prepare(`SELECT COUNT(*) as n FROM event_applications WHERE event_id=? AND status='approved'`),
  withdrawApplication:     prepare(`UPDATE event_applications SET status='withdrawn', updated_at=datetime('now') WHERE event_id=? AND vendor_user_id=?`),

  // organiser events
  createEvent:        prepare(`INSERT INTO events (slug,name,category,suburb,state,date_sort,date_end,date_text,description,stalls_available,stall_fee_min,stall_fee_max,deadline,organiser_name,organiser_user_id,venue_name,cover_image,booth_size,setup_time,packdown_time,power_available,power_amps,water_available,cuisines_wanted,exclusivity,looking_for,custom_requirements,cancel_policy,payment_terms) VALUES (@slug,@name,@category,@suburb,@state,@date_sort,@date_end,@date_text,@description,@stalls_available,@stall_fee_min,@stall_fee_max,@deadline,@organiser_name,@organiser_user_id,@venue_name,@cover_image,@booth_size,@setup_time,@packdown_time,@power_available,@power_amps,@water_available,@cuisines_wanted,@exclusivity,@looking_for,@custom_requirements,@cancel_policy,@payment_terms)`),
  getOrganiserEvents: prepare(`SELECT * FROM events WHERE organiser_user_id=? ORDER BY date_sort ASC`),
  countOrganiserEvents: prepare(`SELECT COUNT(*) as n FROM events WHERE organiser_user_id=? AND status IN ('draft','published')`),
  // single query — all apps across all of an organiser's events (replaces N+1 loop)
  getAllAppsByOrganiser: prepare(`SELECT ea.*,e.name as event_name,u.first_name,u.last_name,u.email,v.trading_name,v.mobile,v.suburb as v_suburb,v.state as v_state,v.bio,v.cuisine_tags,v.plan,v.instagram,v.setup_type,v.stall_w,v.stall_d,v.power,v.water,v.price_range FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id WHERE e.organiser_user_id=? ORDER BY ea.created_at DESC`),

  // optimised single-query events+application status for vendor dashboard
  publishedEventsForVendor: prepare(`
    SELECT e.*,
      ea.status as appStatus,
      CASE WHEN ea.id IS NOT NULL THEN 1 ELSE 0 END as applied,
      (SELECT COUNT(*) FROM event_applications WHERE event_id = e.id AND status != 'rejected') as stalls_filled
    FROM events e
    LEFT JOIN event_applications ea ON ea.event_id = e.id AND ea.vendor_user_id = ?
    WHERE e.status = 'published'
    ORDER BY e.date_sort ASC
  `),

  // messaging
  createOrGetThread: prepare(`INSERT OR IGNORE INTO message_threads (thread_key, vendor_user_id, organiser_user_id) VALUES (?, ?, ?)`),
  getThread:         prepare(`
    SELECT mt.*,
      COALESCE(v.trading_name, uv.first_name||' '||uv.last_name) as vendor_name,
      COALESCE(o.org_name, CASE WHEN uo.role='admin' THEN 'Pitch. Admin' ELSE uo.first_name||' '||uo.last_name END) as organiser_name,
      uv.last_active as vendor_last_active,
      uo.last_active as organiser_last_active,
      (SELECT e.name FROM event_applications ea JOIN events e ON e.id = ea.event_id WHERE ea.vendor_user_id = mt.vendor_user_id AND e.organiser_user_id = mt.organiser_user_id ORDER BY ea.created_at DESC LIMIT 1) as event_name
    FROM message_threads mt
    LEFT JOIN vendors v ON v.user_id = mt.vendor_user_id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=mt.vendor_user_id)
    LEFT JOIN users uv ON uv.id = mt.vendor_user_id
    LEFT JOIN organisers o ON o.user_id = mt.organiser_user_id
    LEFT JOIN users uo ON uo.id = mt.organiser_user_id
    WHERE mt.thread_key = ?
  `),
  // LEFT JOINs so threads show even if vendor/organiser profile row is missing
  getThreadsForUser: prepare(`
    SELECT mt.thread_key, mt.vendor_user_id, mt.organiser_user_id,
      COALESCE(v.trading_name, uv.first_name||' '||uv.last_name) as vendor_name,
      COALESCE(o.org_name, CASE WHEN uo.role='admin' THEN 'Pitch. Admin' ELSE uo.first_name||' '||uo.last_name END) as organiser_name,
      uv.last_active as vendor_last_active,
      uo.last_active as organiser_last_active,
      (SELECT body FROM messages m2 WHERE m2.thread_key = mt.thread_key ORDER BY m2.id DESC LIMIT 1) as last_body,
      (SELECT m2.created_at FROM messages m2 WHERE m2.thread_key = mt.thread_key ORDER BY m2.id DESC LIMIT 1) as last_at,
      (SELECT COUNT(*) FROM messages m2 WHERE m2.thread_key = mt.thread_key AND m2.sender_user_id != ? AND m2.is_read = 0) as unread_count,
      (SELECT e.name FROM event_applications ea JOIN events e ON e.id = ea.event_id WHERE ea.vendor_user_id = mt.vendor_user_id AND e.organiser_user_id = mt.organiser_user_id ORDER BY ea.created_at DESC LIMIT 1) as event_name
    FROM message_threads mt
    LEFT JOIN vendors v ON v.user_id = mt.vendor_user_id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=mt.vendor_user_id)
    LEFT JOIN users uv ON uv.id = mt.vendor_user_id
    LEFT JOIN organisers o ON o.user_id = mt.organiser_user_id
    LEFT JOIN users uo ON uo.id = mt.organiser_user_id
    WHERE mt.vendor_user_id = ? OR mt.organiser_user_id = ?
    ORDER BY last_at DESC
  `),
  getUnreadByThread: prepare(`SELECT COUNT(*) as count FROM messages WHERE thread_key = ? AND sender_user_id != ? AND is_read = 0`),
  getMessagesInThread: prepare(`SELECT * FROM messages WHERE thread_key = ? ORDER BY id ASC`),
  sendMessage:         prepare(`INSERT INTO messages (thread_key, sender_user_id, body) VALUES (?, ?, ?)`),
  markThreadRead:      prepare(`UPDATE messages SET is_read = 1 WHERE thread_key = ? AND sender_user_id != ? AND is_read = 0`),
  getUnreadMsgCount:   prepare(`
    SELECT COUNT(*) as count FROM messages m
    JOIN message_threads mt ON mt.thread_key = m.thread_key
    WHERE (mt.vendor_user_id = ? OR mt.organiser_user_id = ?) AND m.sender_user_id != ? AND m.is_read = 0
  `),

  // organiser ratings + reviews
  getOrgVendorRatings:   prepare(`SELECT ovr.*,v.trading_name,e.name as event_name FROM organiser_vendor_ratings ovr JOIN vendors v ON v.user_id=ovr.vendor_user_id LEFT JOIN events e ON e.id=ovr.event_id WHERE ovr.organiser_user_id=? ORDER BY ovr.created_at DESC`),
  upsertVendorRating:    prepare(`INSERT OR REPLACE INTO organiser_vendor_ratings (organiser_user_id,vendor_user_id,event_id,punctual,presentation,would_rebook,notes) VALUES (@organiser_user_id,@vendor_user_id,@event_id,@punctual,@presentation,@would_rebook,@notes)`),
  getOrgReviews:         prepare(`SELECT or2.*,v.trading_name FROM organiser_reviews or2 JOIN vendors v ON v.user_id=or2.vendor_user_id WHERE or2.organiser_user_id=? ORDER BY or2.created_at DESC`),
  getOrgReviewAvg:       prepare(`SELECT AVG(rating) as avg, COUNT(*) as total FROM organiser_reviews WHERE organiser_user_id=?`),
  createOrgReview:       prepare(`INSERT INTO organiser_reviews (organiser_user_id,vendor_user_id,event_id,event_name,rating,body) VALUES (@organiser_user_id,@vendor_user_id,@event_id,@event_name,@rating,@body)`),
  flagOrgReview:         prepare(`UPDATE organiser_reviews SET flagged=1 WHERE id=? AND organiser_user_id=?`),

  // organiser calendar
  getOrgCalendar:        prepare(`SELECT id,name,slug,date_sort,date_end,deadline,status,suburb,state,category FROM events WHERE organiser_user_id=? AND status != 'deleted' ORDER BY date_sort ASC`),

  // organiser analytics (applications per event)
  getOrgEventStats:      prepare(`SELECT e.id,e.name,e.date_sort,e.category, COUNT(ea.id) as total_apps, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN ea.status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN ea.status='rejected' THEN 1 ELSE 0 END) as rejected FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.organiser_user_id=? GROUP BY e.id ORDER BY e.date_sort DESC`),

  // ── Organiser analytics (extended) ──────────────────────────────────────────
  getOrgRevenueCollected:   prepare(`SELECT COALESCE(SUM(sf.amount),0) as total FROM stall_fees sf JOIN events e ON sf.event_id=e.id WHERE e.organiser_user_id=? AND sf.status='paid'`),
  getOrgRevenueOutstanding: prepare(`SELECT COALESCE(SUM(sf.amount),0) as total FROM stall_fees sf JOIN events e ON sf.event_id=e.id WHERE e.organiser_user_id=? AND sf.status='unpaid'`),
  getOrgRevenueByEvent:     prepare(`SELECT e.id,e.name,e.date_sort, COALESCE(SUM(CASE WHEN sf.status='paid' THEN sf.amount ELSE 0 END),0) as collected, COALESCE(SUM(CASE WHEN sf.status='unpaid' THEN sf.amount ELSE 0 END),0) as outstanding, COUNT(sf.id) as total_invoices FROM events e LEFT JOIN stall_fees sf ON sf.event_id=e.id WHERE e.organiser_user_id=? GROUP BY e.id HAVING total_invoices>0 ORDER BY e.date_sort DESC`),
  getOrgAvgStallFee:        prepare(`SELECT ROUND(AVG(sf.amount),0) as avg_fee FROM stall_fees sf JOIN events e ON sf.event_id=e.id WHERE e.organiser_user_id=? AND sf.status IN ('paid','unpaid')`),
  getOrgAppStats:           prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN ea.status='rejected' THEN 1 ELSE 0 END) as rejected, SUM(CASE WHEN ea.status='pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN ea.status='withdrawn' THEN 1 ELSE 0 END) as withdrawn FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=?`),
  getOrgAvgResponseTime:    prepare(`SELECT ROUND(AVG((julianday(ea.approved_at)-julianday(ea.created_at))*24),1) as avg_hours FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? AND ea.approved_at IS NOT NULL AND ea.status IN ('approved','rejected')`),
  getOrgAppsByMonth:        prepare(`SELECT strftime('%Y-%m',ea.created_at) as month, COUNT(*) as apps FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? AND ea.created_at>=date('now','-5 months','start of month') GROUP BY strftime('%Y-%m',ea.created_at) ORDER BY month ASC`),
  getOrgTopVendors:         prepare(`SELECT v.trading_name,v.cuisine_tags,v.suburb,v.state, COUNT(ea.id) as times_booked, MAX(e.date_sort) as last_event_date FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE e.organiser_user_id=? AND ea.status='approved' GROUP BY ea.vendor_user_id ORDER BY times_booked DESC LIMIT 10`),
  getOrgCuisineMix:         prepare(`SELECT v.cuisine_tags FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE e.organiser_user_id=? AND ea.status='approved'`),
  getOrgRepeatVendors:      prepare(`SELECT COUNT(*) as total_unique, SUM(CASE WHEN cnt>=2 THEN 1 ELSE 0 END) as repeat_vendors FROM (SELECT ea.vendor_user_id, COUNT(DISTINCT ea.event_id) as cnt FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? AND ea.status='approved' GROUP BY ea.vendor_user_id)`),
  getOrgVendorQuality:      prepare(`SELECT ROUND(AVG(punctual),1) as avg_punctual, ROUND(AVG(presentation),1) as avg_presentation, ROUND(SUM(would_rebook)*100.0/COUNT(*),0) as rebook_rate, COUNT(*) as total_rated FROM organiser_vendor_ratings WHERE organiser_user_id=?`),
  getOrgEventComparison:    prepare(`SELECT e.id,e.name,e.date_sort,e.category,e.suburb, COALESCE(e.stalls_available,0) as stalls_available, COUNT(ea.id) as total_apps, SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved, CASE WHEN COALESCE(e.stalls_available,0)>0 THEN ROUND(SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END)*100.0/e.stalls_available,0) ELSE 0 END as fill_rate, CASE WHEN COALESCE(e.stalls_available,0)>0 THEN ROUND(COUNT(ea.id)*1.0/e.stalls_available,1) ELSE 0 END as demand_ratio FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.organiser_user_id=? AND e.status!='deleted' GROUP BY e.id ORDER BY fill_rate DESC,total_apps DESC`),
  getOrgCategoryPerformance:prepare(`SELECT COALESCE(e.category,'Uncategorised') as category, COUNT(DISTINCT e.id) as event_count, ROUND(AVG(sub.total_apps),1) as avg_apps, ROUND(AVG(sub.fill_rate),0) as avg_fill_rate FROM events e LEFT JOIN (SELECT ea.event_id, COUNT(ea.id) as total_apps, CASE WHEN COALESCE(e2.stalls_available,0)>0 THEN SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END)*100.0/e2.stalls_available ELSE 0 END as fill_rate FROM event_applications ea JOIN events e2 ON ea.event_id=e2.id WHERE e2.organiser_user_id=? GROUP BY ea.event_id) sub ON sub.event_id=e.id WHERE e.organiser_user_id=? AND e.status!='deleted' GROUP BY e.category ORDER BY avg_apps DESC`),
  getOrgReviewDistribution: prepare(`SELECT rating, COUNT(*) as count FROM organiser_reviews WHERE organiser_user_id=? GROUP BY rating ORDER BY rating DESC`),

  // application velocity
  getOrgAppVelocityBuckets: prepare(`SELECT CASE WHEN julianday(ea.created_at)-julianday(e.created_at)<1 THEN 'Day 1' WHEN julianday(ea.created_at)-julianday(e.created_at)<2 THEN 'Day 2' WHEN julianday(ea.created_at)-julianday(e.created_at)<3 THEN 'Day 3' WHEN julianday(ea.created_at)-julianday(e.created_at)<7 THEN 'Days 4–7' ELSE '7+ days' END as bucket, COUNT(*) as count FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? GROUP BY bucket ORDER BY MIN(julianday(ea.created_at)-julianday(e.created_at))`),
  getOrgAvgFirstApp:        prepare(`SELECT ROUND(AVG(first_h),1) as avg_hours FROM (SELECT MIN((julianday(ea.created_at)-julianday(e.created_at))*24) as first_h FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? GROUP BY e.id)`),

  // no-show / attendance tracking
  markAttendance:           prepare(`UPDATE event_applications SET attended=? WHERE id=? AND event_id IN (SELECT id FROM events WHERE organiser_user_id=?)`),
  getOrgAttendanceStats:    prepare(`SELECT COUNT(CASE WHEN ea.attended=1 THEN 1 END) as showed, COUNT(CASE WHEN ea.attended=0 THEN 1 END) as no_show, COUNT(CASE WHEN ea.attended IS NULL AND ea.status='approved' THEN 1 END) as unmarked FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE e.organiser_user_id=? AND ea.status='approved' AND e.date_sort<date('now')`),
  getOrgNoShowVendors:      prepare(`SELECT v.trading_name, v.user_id, COUNT(CASE WHEN ea.attended=0 THEN 1 END) as no_shows, COUNT(CASE WHEN ea.attended IS NOT NULL THEN 1 END) as total_marked FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE e.organiser_user_id=? AND ea.status='approved' GROUP BY ea.vendor_user_id HAVING no_shows>0 ORDER BY no_shows DESC LIMIT 5`),

  // revenue forecast
  getOrgRevenueForecast:    prepare(`SELECT e.id,e.name,e.date_sort,e.suburb, COALESCE(e.stalls_available,0) as stalls_available, COALESCE(e.stall_fee_min,0) as fee_min, COALESCE(e.stall_fee_max,0) as fee_max, COUNT(CASE WHEN ea.status='approved' THEN 1 END) as approved, COUNT(CASE WHEN ea.status='pending' THEN 1 END) as pending FROM events e LEFT JOIN event_applications ea ON ea.event_id=e.id WHERE e.organiser_user_id=? AND e.status='published' AND e.date_sort>date('now') AND (e.stall_fee_min>0 OR e.stall_fee_max>0) GROUP BY e.id ORDER BY e.date_sort ASC`),

  // organiser settings
  updateOrganiserSettings: prepare(`UPDATE organisers SET notif_new_apps=@notif_new_apps,notif_deadlines=@notif_deadlines,notif_messages=@notif_messages,notif_payments=@notif_payments,notif_post_event=@notif_post_event WHERE user_id=@user_id`),
  pauseOrganiser:          prepare(`UPDATE organisers SET paused=? WHERE user_id=?`),
  updateOrganiserDefaults: prepare(`UPDATE organisers SET default_stall_fee_min=@default_stall_fee_min,default_stall_fee_max=@default_stall_fee_max,default_spots=@default_spots,default_booth_size=@default_booth_size,default_power=@default_power,default_water=@default_water WHERE user_id=@user_id`),
  updateOrganiserTimezone: prepare(`UPDATE organisers SET timezone=@timezone WHERE user_id=@user_id`),
  updateOrganiserTimeFormat: prepare(`UPDATE organisers SET time_format=@time_format WHERE user_id=@user_id`),
  updateOrganiserAutoResponse: prepare(`UPDATE organisers SET auto_response_template=@template WHERE user_id=@user_id`),
  updateOrganiserBanner:   prepare(`UPDATE organisers SET banner_url=? WHERE user_id=?`),

  // public organiser profile
  publicOrganiserById:     prepare(`SELECT o.*, u.avatar_url, u.first_name, u.last_name, u.status FROM organisers o JOIN users u ON u.id=o.user_id WHERE o.user_id=?`),
  getOrgPublicEvents:      prepare(`SELECT id, slug, name, category, suburb, state, date_sort, date_end, date_text, description, cover_image, stalls_available, stall_fee_min, stall_fee_max FROM events WHERE organiser_user_id=? AND status='published' ORDER BY date_sort ASC`),

  // team members
  inviteTeamMember:        prepare(`INSERT OR IGNORE INTO organiser_team_members (organiser_user_id,email,role) VALUES (?,?,?)`),
  getTeamMembers:          prepare(`SELECT otm.*, u.first_name, u.last_name, u.avatar_url FROM organiser_team_members otm LEFT JOIN users u ON u.id=otm.member_user_id WHERE otm.organiser_user_id=? ORDER BY otm.invited_at DESC`),
  removeTeamMember:        prepare(`DELETE FROM organiser_team_members WHERE id=? AND organiser_user_id=?`),
  acceptTeamInvite:        prepare(`UPDATE organiser_team_members SET status='accepted',member_user_id=?,accepted_at=datetime('now') WHERE id=? AND email=?`),

  // cancel event
  cancelEvent: prepare(`UPDATE events SET status='archived',cancelled_at=datetime('now'),cancel_reason=? WHERE id=?`),

  // vendor reviews
  getReviewsByVendor:  prepare(`SELECT * FROM vendor_reviews WHERE vendor_user_id=? ORDER BY created_at DESC`),
  getReviewAvg:        prepare(`SELECT AVG(rating) as avg, COUNT(*) as total FROM vendor_reviews WHERE vendor_user_id=?`),
  getGlobalReviewAvg:  prepare(`SELECT ROUND(AVG(rating),1) as avg FROM vendor_reviews`),
  countAllApplications:prepare(`SELECT COUNT(*) as n FROM event_applications`),
  createReview:        prepare(`INSERT INTO vendor_reviews (vendor_user_id,event_id,event_name,reviewer_name,rating,body) VALUES (@vendor_user_id,@event_id,@event_name,@reviewer_name,@rating,@body)`),
  flagReview:          prepare(`UPDATE vendor_reviews SET flagged=1 WHERE id=? AND vendor_user_id=?`),
  getReviewById:       prepare(`SELECT * FROM vendor_reviews WHERE id=?`),

  // stall fees
  getStallFeesByVendor: prepare(`SELECT * FROM stall_fees WHERE vendor_user_id=? ORDER BY created_at DESC`),
  createStallFee:       prepare(`INSERT INTO stall_fees (vendor_user_id,event_id,event_name,amount,due_date,status) VALUES (@vendor_user_id,@event_id,@event_name,@amount,@due_date,@status)`),
  payStallFee:          prepare(`UPDATE stall_fees SET status='paid',paid_at=datetime('now') WHERE id=? AND vendor_user_id=?`),
  getStallFeeById:      prepare(`SELECT * FROM stall_fees WHERE id=?`),
  updateStallFeeStripePI: prepare(`UPDATE stall_fees SET stripe_payment_intent_id=? WHERE id=? AND vendor_user_id=?`),
  getStallFeeByStripePI:  prepare(`SELECT * FROM stall_fees WHERE stripe_payment_intent_id=?`),
  markStallFeePaid:       prepare(`UPDATE stall_fees SET status='paid',paid_at=datetime('now') WHERE stripe_payment_intent_id=?`),

  // vendor earnings
  getVendorEarningsSummary: prepare(`SELECT COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) as total_earned, COUNT(CASE WHEN status='paid' THEN 1 END) as events_completed, COALESCE(SUM(CASE WHEN status='paid' AND paid_at>=date('now','start of month') THEN amount ELSE 0 END),0) as this_month, COUNT(CASE WHEN status='paid' AND paid_at>=date('now','start of month') THEN 1 END) as this_month_events, COALESCE(SUM(CASE WHEN status='paid' AND paid_at>=date('now','start of month','-1 month') AND paid_at<date('now','start of month') THEN amount ELSE 0 END),0) as last_month, COUNT(CASE WHEN status='paid' AND paid_at>=date('now','start of month','-1 month') AND paid_at<date('now','start of month') THEN 1 END) as last_month_events, COALESCE(SUM(CASE WHEN status='unpaid' THEN amount ELSE 0 END),0) as pending FROM stall_fees WHERE vendor_user_id=?`),
  getVendorEarningsHistory: prepare(`SELECT sf.id,sf.event_name,sf.amount,sf.status,sf.paid_at,sf.created_at, e.date_sort as event_date,e.organiser_name FROM stall_fees sf LEFT JOIN events e ON sf.event_id=e.id WHERE sf.vendor_user_id=? ORDER BY COALESCE(sf.paid_at,sf.created_at) DESC`),
  getVendorEarningsFY:      prepare(`SELECT COALESCE(SUM(amount),0) as fy_total,COUNT(*) as fy_events FROM stall_fees WHERE vendor_user_id=? AND status='paid' AND paid_at>=? AND paid_at<?`),

  // vendor calendar (approved apps with future events)
  getVendorCalendar:   prepare(`SELECT ea.*,e.name as event_name,e.date_sort,e.date_end,e.suburb,e.state,e.category FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE ea.vendor_user_id=? ORDER BY e.date_sort ASC`),
  getVendorByCalToken: prepare(`SELECT user_id FROM vendors WHERE calendar_feed_token=?`),
  setVendorCalToken:   prepare(`UPDATE vendors SET calendar_feed_token=@token WHERE user_id=@user_id`),

  // organiser calendar feed
  getOrganiserByCalToken: prepare(`SELECT user_id FROM organisers WHERE calendar_feed_token=?`),
  setOrganiserCalToken:   prepare(`UPDATE organisers SET calendar_feed_token=@token WHERE user_id=@user_id`),

  // vendor market history (approved apps for past events)
  getVendorHistory:    prepare(`SELECT ea.*,e.name as event_name,e.date_sort,e.suburb,e.state,e.category,e.organiser_name,e.stall_fee_min,e.stall_fee_max FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE ea.vendor_user_id=? AND ea.status='approved' ORDER BY e.date_sort DESC`),

  // vendor settings
  updateVendorSettings: prepare(`UPDATE vendors SET notif_apps=@notif_apps,notif_docs=@notif_docs,notif_reviews=@notif_reviews,notif_payments=@notif_payments WHERE user_id=@user_id`),
  pauseVendor:          prepare(`UPDATE vendors SET paused=? WHERE user_id=?`),
  updateVendorExtSettings: prepare(`UPDATE vendors SET default_apply_message=@default_apply_message,timezone=@timezone,invoice_business_name=@invoice_business_name,invoice_address=@invoice_address,hide_phone=@hide_phone,hide_abn=@hide_abn,hide_reviews=@hide_reviews WHERE user_id=@user_id`),
  updateVendorMobile:   prepare(`UPDATE vendors SET mobile=? WHERE user_id=?`),
  setTwoFactor:         prepare(`UPDATE users SET two_factor_enabled=? WHERE id=?`),

  // subscription / application quota
  getVendorSubscription:     prepare(`SELECT plan,apps_this_month,apps_reset_month,trial_ends_at,subscription_status,plan_override,plan_override_by,plan_override_at,plan_override_reason,plan_override_expires FROM vendors WHERE user_id=?`),
  incrementAppsThisMonth:    prepare(`UPDATE vendors SET apps_this_month=apps_this_month+1, apps_reset_month=? WHERE user_id=?`),
  resetAndIncrementApps:     prepare(`UPDATE vendors SET apps_this_month=1, apps_reset_month=? WHERE user_id=?`),
  resetAppsCounter:          prepare(`UPDATE vendors SET apps_this_month=0, apps_reset_month=? WHERE user_id=?`),

  // subscription management (admin override)
  updateVendorPlanOverride:  prepare(`UPDATE vendors SET plan=@plan, plan_override=@plan_override, plan_override_by=@plan_override_by, plan_override_at=@plan_override_at, plan_override_reason=@plan_override_reason, plan_override_expires=@plan_override_expires WHERE user_id=@user_id`),
  clearVendorOverride:       prepare(`UPDATE vendors SET plan_override=0, plan_override_by=NULL, plan_override_at=NULL, plan_override_reason=NULL, plan_override_expires=NULL WHERE user_id=?`),
  updateVendorTrialEnd:      prepare(`UPDATE vendors SET trial_ends_at=? WHERE user_id=?`),
  insertSubscriptionChange:  prepare(`INSERT INTO subscription_changes (user_id,old_plan,new_plan,changed_by,admin_user_id,reason,payment_status,is_override,override_expires) VALUES (@user_id,@old_plan,@new_plan,@changed_by,@admin_user_id,@reason,@payment_status,@is_override,@override_expires)`),
  getSubscriptionChanges:    prepare(`SELECT * FROM subscription_changes WHERE user_id=? ORDER BY created_at DESC LIMIT 20`),
  getLastPayment:            prepare(`SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC LIMIT 1`),
  getExpiredOverrides:        prepare(`SELECT v.user_id, v.plan, v.plan_override_expires, u.email, u.first_name FROM vendors v JOIN users u ON v.user_id=u.id WHERE v.plan_override=1 AND v.plan_override_expires IS NOT NULL AND v.plan_override_expires <= datetime('now')`),

  // content flags
  getFlags:            prepare(`SELECT cf.*, COALESCE(u.first_name||' '||u.last_name, '') as target_user_name, COALESCE(u.email,'') as target_email FROM content_flags cf LEFT JOIN users u ON u.id=cf.target_user_id ORDER BY cf.created_at DESC`),
  getFlagById:         prepare(`SELECT * FROM content_flags WHERE id=?`),
  updateFlagStatus:    prepare(`UPDATE content_flags SET status=?,resolved_at=datetime('now'),resolved_by=? WHERE id=?`),
  unresolveFlagStatus: prepare(`UPDATE content_flags SET status='pending',resolved_at=NULL,resolved_by=NULL WHERE id=?`),
  deleteResolvedFlags: prepare(`DELETE FROM content_flags WHERE status IN ('removed','warned','dismissed')`),

  // announcements
  createAnnouncement:   prepare(`INSERT INTO announcements (subject,body,audience,delivery,created_by) VALUES (@subject,@body,@audience,@delivery,@created_by)`),
  getAnnouncements:     prepare(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50`),
  getAnnouncementsFor:  prepare(`SELECT * FROM announcements WHERE audience='all' OR audience=? ORDER BY created_at DESC LIMIT 20`),
  getRecentAnnouncements: prepare(`SELECT * FROM announcements WHERE (audience='all' OR audience=? OR audience=? OR audience=?) AND created_at > datetime('now','-30 days') ORDER BY created_at DESC`),
  getUnreadAnnouncements: prepare(`SELECT a.* FROM announcements a WHERE (a.audience='all' OR a.audience=? OR a.audience=? OR a.audience=?) AND a.created_at > datetime('now','-30 days') AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id=?) ORDER BY a.created_at DESC`),
  dismissAnnouncement:    prepare(`INSERT OR IGNORE INTO announcement_reads (user_id, announcement_id) VALUES (?, ?)`),

  // menu items
  getMenuItems:       prepare(`SELECT * FROM menu_items WHERE vendor_user_id=? ORDER BY is_signature DESC, sort_order ASC, id ASC`),
  getMenuItemById:    prepare(`SELECT * FROM menu_items WHERE id=? AND vendor_user_id=?`),
  createMenuItem:     prepare(`INSERT INTO menu_items (vendor_user_id,name,description,price_type,price_min,price_max,category,photo_url,available,seasonal,is_signature,dietary_tags,sort_order) VALUES (@vendor_user_id,@name,@description,@price_type,@price_min,@price_max,@category,@photo_url,@available,@seasonal,@is_signature,@dietary_tags,(SELECT COALESCE(MAX(sort_order),0)+1 FROM menu_items WHERE vendor_user_id=@vendor_user_id))`),
  updateMenuItem:     prepare(`UPDATE menu_items SET name=@name,description=@description,price_type=@price_type,price_min=@price_min,price_max=@price_max,category=@category,photo_url=@photo_url,available=@available,seasonal=@seasonal,is_signature=@is_signature,dietary_tags=@dietary_tags WHERE id=@id AND vendor_user_id=@vendor_user_id`),
  deleteMenuItem:     prepare(`DELETE FROM menu_items WHERE id=? AND vendor_user_id=?`),
  clearSignature:     prepare(`UPDATE menu_items SET is_signature=0 WHERE vendor_user_id=?`),
  updateMenuOrder:    prepare(`UPDATE menu_items SET sort_order=@sort_order WHERE id=@id AND vendor_user_id=@vendor_user_id`),
  publicMenuItems:    prepare(`SELECT * FROM menu_items WHERE vendor_user_id=? ORDER BY is_signature DESC, sort_order ASC, id ASC`),

  // foodies
  getFoodieByUserId:   prepare(`SELECT * FROM foodies WHERE user_id=?`),
  getSavedEvents:      prepare(`SELECT event_slug,created_at FROM saved_events WHERE user_id=? ORDER BY created_at DESC`),
  saveEvent:           prepare(`INSERT OR IGNORE INTO saved_events (user_id,event_slug) VALUES (?,?)`),
  unsaveEvent:         prepare(`DELETE FROM saved_events WHERE user_id=? AND event_slug=?`),
  isEventSaved:        prepare(`SELECT 1 FROM saved_events WHERE user_id=? AND event_slug=?`),
  getFollowedVendors:  prepare(`SELECT fv.*,v.trading_name,v.cuisine_tags,v.suburb,v.state FROM followed_vendors fv LEFT JOIN vendors v ON CAST(v.user_id AS TEXT)=CAST(fv.vendor_user_id AS TEXT) WHERE fv.user_id=? ORDER BY fv.created_at DESC`),
  getFollowedVendorIds: prepare(`SELECT vendor_user_id,created_at FROM followed_vendors WHERE user_id=? ORDER BY created_at DESC`),
  followVendor:        prepare(`INSERT OR IGNORE INTO followed_vendors (user_id,vendor_user_id) VALUES (?,?)`),
  unfollowVendor:      prepare(`DELETE FROM followed_vendors WHERE user_id=? AND vendor_user_id=?`),
  isVendorFollowed:    prepare(`SELECT 1 FROM followed_vendors WHERE user_id=? AND vendor_user_id=?`),
  countFollowers:      prepare(`SELECT COUNT(*) as n FROM followed_vendors WHERE vendor_user_id=?`),

  // user lookup by display name (for report against_user resolution)
  findUserByTradingName: prepare(`SELECT v.user_id, u.first_name, u.last_name, u.email FROM vendors v JOIN users u ON u.id=v.user_id WHERE LOWER(v.trading_name)=LOWER(?) LIMIT 1`),
  findUserByOrgName:     prepare(`SELECT o.user_id, u.first_name, u.last_name, u.email FROM organisers o JOIN users u ON u.id=o.user_id WHERE LOWER(o.org_name)=LOWER(?) LIMIT 1`),

  // reports (admin)
  getAllReports:     prepare(`SELECT * FROM reports ORDER BY created_at DESC`),
  getReportById:     prepare(`SELECT * FROM reports WHERE id=?`),
  createReport:      prepare(`INSERT INTO reports (type,ref_number,reporter_name,reporter_user_id,reporter_email,against_name,against_user_id,body,event_name) VALUES (@type,@ref_number,@reporter_name,@reporter_user_id,@reporter_email,@against_name,@against_user_id,@body,@event_name)`),
  resolveReport:     prepare(`UPDATE reports SET status='resolved',resolved_by=@resolved_by,resolved_at=datetime('now') WHERE id=@id`),
  dismissReport:     prepare(`UPDATE reports SET status='dismissed',resolved_by=@resolved_by,resolved_at=datetime('now') WHERE id=@id`),
  unresolveReport:   prepare(`UPDATE reports SET status='open',resolved_by=NULL,resolved_at=NULL WHERE id=@id`),
  requestInfoReport: prepare(`UPDATE reports SET status='info-requested',info_requested_at=datetime('now') WHERE id=?`),
  hideContentReport: prepare(`UPDATE reports SET status='resolved',resolved_by=@resolved_by,resolved_at=datetime('now') WHERE id=@id`),
  getNextReportRef:  prepare(`SELECT COALESCE(MAX(ref_number),1049)+1 AS next FROM reports`),

  // public vendors
  publicVendors: prepare(`
    SELECT v.user_id, v.trading_name, v.suburb, v.state, v.bio, v.cuisine_tags,
           v.setup_type, v.stall_w, v.stall_d, v.power, v.water, v.price_range,
           v.instagram, v.plan, v.abn_verified,
           u.status, u.avatar_url, u.email_verified,
           COALESCE(rv.avg_rating, 0)       AS rating,
           COALESCE(rv.review_count, 0)     AS review_count,
           COALESCE(ec.events_completed, 0) AS events_completed
    FROM users u
    JOIN vendors v ON v.user_id = u.id
    LEFT JOIN (
      SELECT vendor_user_id,
             ROUND(AVG(rating), 1) AS avg_rating,
             COUNT(*)              AS review_count
      FROM vendor_reviews
      WHERE flagged = 0
      GROUP BY vendor_user_id
    ) rv ON rv.vendor_user_id = v.user_id
    LEFT JOIN (
      SELECT ea.vendor_user_id,
             COUNT(*) AS events_completed
      FROM event_applications ea
      JOIN events e ON e.id = ea.event_id
      WHERE ea.status = 'approved'
        AND (
          e.completed_at IS NOT NULL
          OR COALESCE(e.date_end, e.date_sort) < date('now')
        )
      GROUP BY ea.vendor_user_id
    ) ec ON ec.vendor_user_id = v.user_id
    WHERE u.role = 'vendor' AND u.status = 'active'
    ORDER BY
      CASE v.plan WHEN 'growth' THEN 0 WHEN 'pro' THEN 1 ELSE 2 END ASC,
      v.created_at ASC
  `),
  publicVendorById: prepare(`
    SELECT v.*,u.status,u.first_name,u.last_name,u.avatar_url
    FROM vendors v JOIN users u ON v.user_id=u.id
    WHERE v.user_id=? AND u.status='active'
  `),
  // platform settings
  getAllSettings:   prepare(`SELECT key, value FROM platform_settings`),
  getSetting:       prepare(`SELECT value FROM platform_settings WHERE key = ?`),
  upsertSetting:    prepare(`INSERT INTO platform_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`),

  // ── Analytics: profile views ──────────────────────────────────────────────
  recordProfileView: prepare(`INSERT INTO vendor_profile_views (vendor_user_id, viewer_user_id, viewer_role, viewer_ip_hash, referrer) VALUES (?,?,?,?,?)`),
  getProfileViews30d: prepare(`SELECT COUNT(*) as total FROM vendor_profile_views WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')`),
  getProfileViewsDaily30d: prepare(`
    SELECT date(created_at) as day, COUNT(*) as views
    FROM vendor_profile_views
    WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')
    GROUP BY date(created_at) ORDER BY day ASC
  `),
  getProfileViewsUnique30d: prepare(`SELECT COUNT(DISTINCT viewer_ip_hash) as unique_visitors FROM vendor_profile_views WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')`),
  getProfileViewsBySource30d: prepare(`
    SELECT COALESCE(referrer,'direct') as referrer, COUNT(*) as views
    FROM vendor_profile_views
    WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')
    GROUP BY referrer ORDER BY views DESC
  `),
  getProfileViewsByRole30d: prepare(`
    SELECT COALESCE(viewer_role,'anonymous') as viewer_role, COUNT(*) as views
    FROM vendor_profile_views
    WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')
    GROUP BY viewer_role ORDER BY views DESC
  `),
  getProfileViewsHourly30d: prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as views
    FROM vendor_profile_views
    WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')
    GROUP BY hour ORDER BY hour ASC
  `),

  // ── Analytics: applications ─────────────────────────────────────────────
  getApplicationStats: prepare(`SELECT status, COUNT(*) as count FROM event_applications WHERE vendor_user_id=? GROUP BY status`),
  getApplicationsMonthly6m: prepare(`
    SELECT strftime('%Y-%m', created_at) as month, status, COUNT(*) as count
    FROM event_applications
    WHERE vendor_user_id=? AND created_at >= datetime('now','-6 months')
    GROUP BY month, status ORDER BY month ASC
  `),
  getAvgResponseTime: prepare(`
    SELECT AVG(julianday(COALESCE(ea.updated_at, ea.created_at)) - julianday(ea.created_at)) as avg_days
    FROM event_applications ea
    WHERE ea.vendor_user_id=? AND ea.status IN ('approved','rejected') AND ea.updated_at IS NOT NULL
  `),

  // ── Analytics: revenue ──────────────────────────────────────────────────
  getRevenueTotals: prepare(`
    SELECT
      SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) as total_paid,
      SUM(CASE WHEN status='unpaid' OR status='pending' THEN amount ELSE 0 END) as total_outstanding,
      COUNT(DISTINCT event_id) as events_count
    FROM stall_fees WHERE vendor_user_id=?
  `),
  getRevenueMonthly6m: prepare(`
    SELECT strftime('%Y-%m', paid_at) as month, SUM(amount) as total, COUNT(*) as events
    FROM stall_fees
    WHERE vendor_user_id=? AND status='paid' AND paid_at >= datetime('now','-6 months')
    GROUP BY month ORDER BY month ASC
  `),

  // ── Analytics: reviews ──────────────────────────────────────────────────
  getReviewSummary: prepare(`SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews FROM vendor_reviews WHERE vendor_user_id=?`),
  getReviewTrend6m: prepare(`
    SELECT strftime('%Y-%m', created_at) as month, AVG(rating) as avg_rating, COUNT(*) as count
    FROM vendor_reviews
    WHERE vendor_user_id=? AND created_at >= datetime('now','-6 months')
    GROUP BY month ORDER BY month ASC
  `),

  // ── Analytics: search appearances ───────────────────────────────────────
  recordSearchAppearance: prepare(`INSERT INTO vendor_search_appearances (vendor_user_id, context) VALUES (?,?)`),
  getSearchAppearances30d: prepare(`SELECT COUNT(*) as total FROM vendor_search_appearances WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')`),
  getSearchAppearancesDaily30d: prepare(`
    SELECT date(created_at) as day, COUNT(*) as appearances
    FROM vendor_search_appearances
    WHERE vendor_user_id=? AND created_at >= datetime('now','-30 days')
    GROUP BY date(created_at) ORDER BY day ASC
  `),

  // ── Analytics: competition ──────────────────────────────────────────────
  getCategoryAcceptanceRate: prepare(`
    SELECT
      COUNT(*) as total_apps,
      SUM(CASE WHEN ea.status='approved' THEN 1 ELSE 0 END) as approved_apps
    FROM event_applications ea
    JOIN vendors v ON v.user_id = ea.vendor_user_id
    WHERE v.cuisine_tags LIKE '%' || ? || '%'
      AND ea.vendor_user_id != ?
      AND ea.status != 'withdrawn'
  `),
  getVendorAcceptanceRate: prepare(`
    SELECT
      COUNT(*) as total_apps,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved_apps
    FROM event_applications WHERE vendor_user_id=? AND status != 'withdrawn'
  `),
  getCategoryVendorCount: prepare(`
    SELECT COUNT(*) as count FROM vendors WHERE cuisine_tags LIKE '%' || ? || '%'
  `),
  getCategoryRank: prepare(`
    SELECT COUNT(*) + 1 as rank FROM (
      SELECT ea2.vendor_user_id,
        CAST(SUM(CASE WHEN ea2.status='approved' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1) as rate
      FROM event_applications ea2
      JOIN vendors v2 ON v2.user_id = ea2.vendor_user_id
      WHERE v2.cuisine_tags LIKE '%' || ? || '%'
        AND ea2.vendor_user_id != ?
        AND ea2.status != 'withdrawn'
      GROUP BY ea2.vendor_user_id
      HAVING rate > (
        SELECT CAST(SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS REAL) / MAX(COUNT(*), 1)
        FROM event_applications WHERE vendor_user_id=? AND status != 'withdrawn'
      )
    )
  `),

  // danger zone
  purgeDraftEvents: prepare(`DELETE FROM events WHERE status='draft'`),
  resetPendingApprovals: prepare(`UPDATE users SET status='active' WHERE status='pending'`),
  countDraftEvents: prepare(`SELECT COUNT(*) as n FROM events WHERE status='draft'`),
  countPendingUsers: prepare(`SELECT COUNT(*) as n FROM users WHERE status='pending'`),

  // ── Post-event completion workflow ──────────────────────────────────────────
  getCompletableEvents: prepare(`
    SELECT e.id, e.name, e.slug, e.date_sort, e.date_end, e.organiser_user_id
    FROM events e
    WHERE e.status = 'published'
      AND e.completed_at IS NULL
      AND e.cancelled_at IS NULL
      AND e.date_sort IS NOT NULL
      AND e.organiser_user_id IS NOT NULL
      AND COALESCE(e.date_end, e.date_sort) < date('now')
  `),
  markEventCompleted: prepare(`UPDATE events SET completed_at=datetime('now') WHERE id=?`),
  getApprovedVendorsForEvent: prepare(`
    SELECT ea.vendor_user_id, ea.event_id, u.email, u.first_name, v.trading_name, v.notif_reviews
    FROM event_applications ea
    JOIN users u ON u.id = ea.vendor_user_id
    JOIN vendors v ON v.user_id = ea.vendor_user_id
    WHERE ea.event_id = ? AND ea.status = 'approved'
  `),
  getEventWithOrganiser: prepare(`
    SELECT e.id, e.name, e.slug, e.organiser_user_id,
           u.email as org_email, u.first_name as org_first_name,
           o.org_name, o.notif_post_event
    FROM events e
    JOIN users u ON u.id = e.organiser_user_id
    JOIN organisers o ON o.user_id = e.organiser_user_id
    WHERE e.id = ?
  `),
  insertCompletionNotif: prepare(`INSERT OR IGNORE INTO event_completion_notifications (event_id, user_id, user_role, notif_type, sent_via_email) VALUES (@event_id, @user_id, @user_role, @notif_type, @sent_via_email)`),
  hasCompletionNotif: prepare(`SELECT 1 FROM event_completion_notifications WHERE event_id=? AND user_id=? AND notif_type=?`),
  getPendingRatingsForOrganiser: prepare(`
    SELECT e.id as event_id, e.name as event_name, e.slug, e.completed_at,
           ea.vendor_user_id, v.trading_name, u.first_name as vendor_first_name
    FROM events e
    JOIN event_applications ea ON ea.event_id = e.id AND ea.status = 'approved'
    JOIN users u ON u.id = ea.vendor_user_id
    JOIN vendors v ON v.user_id = ea.vendor_user_id
    WHERE e.organiser_user_id = ?
      AND e.completed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM organiser_vendor_ratings ovr
        WHERE ovr.organiser_user_id = e.organiser_user_id
          AND ovr.vendor_user_id = ea.vendor_user_id
          AND ovr.event_id = e.id
      )
    ORDER BY e.completed_at DESC
  `),
  getPendingReviewsForVendor: prepare(`
    SELECT e.id as event_id, e.name as event_name, e.slug, e.completed_at,
           e.organiser_user_id, o.org_name
    FROM events e
    JOIN event_applications ea ON ea.event_id = e.id AND ea.status = 'approved'
    JOIN organisers o ON o.user_id = e.organiser_user_id
    WHERE ea.vendor_user_id = ?
      AND e.completed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM organiser_reviews orv
        WHERE orv.vendor_user_id = ea.vendor_user_id
          AND orv.organiser_user_id = e.organiser_user_id
          AND orv.event_id = e.id
      )
    ORDER BY e.completed_at DESC
  `),

  // contact messages
  insertContactMessage: prepare(`INSERT INTO contact_messages (name, email, role, subject, message) VALUES (?, ?, ?, ?, ?)`),
  allContactMessages:   prepare(`SELECT * FROM contact_messages ORDER BY created_at DESC`),
  markContactRead:      prepare(`UPDATE contact_messages SET read = 1 WHERE id = ?`),
};

// ── Transactions ─────────────────────────────────────────────────────────────
export const txSignupVendor    = _txSignupVendor;
export const txSignupOrganiser = _txSignupOrganiser;
export const txSignupFoodie    = _txSignupFoodie;
export { prepare, _safeExec as safeExec };

export default _client ?? _localDb;
