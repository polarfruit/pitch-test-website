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
  _localDb = new Database(path.join(__dirname, 'pitch.db'));
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
const SCHEMA_VERSION = 10;
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
      role              TEXT    NOT NULL CHECK(role IN ('vendor','organiser','admin')),
      status            TEXT    NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','active','suspended','banned')),
      email_verified    INTEGER NOT NULL DEFAULT 0,
      phone_verified    INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME DEFAULT (datetime('now'))
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
      photos            TEXT    DEFAULT '[]',
      food_safety_url   TEXT,
      pli_url           TEXT,
      council_url       TEXT,
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
      organiser_name    TEXT,
      organiser_user_id INTEGER REFERENCES users(id),
      description       TEXT,
      stalls_available  INTEGER,
      date_text         TEXT,
      venue_name        TEXT,
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
await _safeExec(`ALTER TABLE events ADD COLUMN date_end TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN stall_fee_min INTEGER`);
await _safeExec(`ALTER TABLE events ADD COLUMN stall_fee_max INTEGER`);
await _safeExec(`ALTER TABLE events ADD COLUMN deadline TEXT`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN spot_number INTEGER`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN approved_at DATETIME`);
await _safeExec(`ALTER TABLE events ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`);
// Deduplicate organisers rows (caused by missing UNIQUE constraint on user_id)
await _safeExec(`DELETE FROM organisers WHERE id NOT IN (SELECT MIN(id) FROM organisers GROUP BY user_id)`);
// Add unique index so this can never happen again
await _safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organisers_user_id ON organisers(user_id)`);
// Link seeded events (organiser_user_id=NULL) to their matching organiser accounts by org_name
await _safeExec(`UPDATE events SET organiser_user_id = (SELECT o.user_id FROM organisers o WHERE o.org_name = events.organiser_name LIMIT 1) WHERE organiser_user_id IS NULL AND organiser_name IS NOT NULL`);
// Fallback: assign any available organiser to events still unlinked after name-match
await _safeExec(`UPDATE events SET organiser_user_id = (SELECT user_id FROM organisers LIMIT 1) WHERE organiser_user_id IS NULL`);

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
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','banned')),
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
await _safeExec(`
  CREATE TABLE IF NOT EXISTS followed_vendors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, vendor_user_id)
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_saved_events_user ON saved_events(user_id)`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_followed_vendors_user ON followed_vendors(user_id)`);

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
    created_at     DATETIME DEFAULT (datetime('now'))
  )
`);
await _safeExec(`CREATE INDEX IF NOT EXISTS idx_menu_vendor ON menu_items(vendor_user_id, sort_order)`);

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

// ── Repair: re-seed vendor records that were lost due to a failed migration ──
// Runs unconditionally — INSERT OR IGNORE means no duplicates if records exist.
{
  const _sv2 = prepare(`INSERT OR IGNORE INTO vendors (user_id,trading_name,suburb,state,bio,cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan) SELECT @user_id,@trading_name,@suburb,@state,@bio,@cuisine_tags,@setup_type,@stall_w,@stall_d,@power,@water,@price_range,@instagram,@plan WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE user_id=@user_id)`);
  const _uid2 = prepare(`SELECT id FROM users WHERE email=?`);
  for (const v of [
    { email:'joe@smokyjoes.com.au',        trading_name:"Smoky Joe's BBQ",   suburb:'Norwood',       state:'SA', bio:"Adelaide's most-loved BBQ food truck, smoking low-and-slow since 2019.", cuisine_tags:'["BBQ"]',             setup_type:'Food Truck',  stall_w:3,   stall_d:3,   power:1, water:0, price_range:'$12–$22', instagram:'@smokyjoes_adl',      plan:'pro'  },
    { email:'maria@tacoloco.com',           trading_name:'Taco Loco',         suburb:'Glenelg',       state:'SA', bio:'Authentic Mexican street food made from scratch every day.',           cuisine_tags:'["Mexican"]',         setup_type:'Pop-up Stall',stall_w:3,   stall_d:2,   power:0, water:1, price_range:'$8–$16',  instagram:'@tacoloco_glenelg',   plan:'pro'  },
    { email:'hello@wokandroll.com.au',      trading_name:'Wok & Roll',        suburb:'Adelaide CBD',  state:'SA', bio:'Modern Asian fusion food truck serving bold, wok-fired flavours.',     cuisine_tags:'["Asian Fusion"]',    setup_type:'Food Truck',  stall_w:3,   stall_d:6,   power:0, water:0, price_range:'$10–$18', instagram:'@wokandroll_adl',     plan:'pro'  },
    { email:'ciao@napoliexpress.com.au',    trading_name:'Napoli Express',    suburb:'Hindmarsh',     state:'SA', bio:'Authentic Neapolitan-style pizza and arancini made fresh on-site.',    cuisine_tags:'["Italian"]',        setup_type:'Pop-up Stall',stall_w:4,   stall_d:3,   power:1, water:1, price_range:'$12–$20', instagram:'@napoliexpressadl',   plan:'free' },
    { email:'hello@thedessertlab.com.au',   trading_name:'The Dessert Lab',   suburb:'North Adelaide',state:'SA', bio:'Creative dessert cart serving handcrafted sweets — Instagram-worthy.',  cuisine_tags:'["Desserts"]',        setup_type:'Cart',        stall_w:2,   stall_d:2,   power:1, water:0, price_range:'$7–$14',  instagram:'@thedessertlab',      plan:'pro'  },
    { email:'brew@beanery.com.au',          trading_name:'Beanery Coffee Co.',suburb:'Unley',         state:'SA', bio:'Specialty coffee on wheels — single-origin beans, La Marzocco cart.',  cuisine_tags:'["Coffee & Drinks"]', setup_type:'Cart',        stall_w:2,   stall_d:1.5, power:1, water:1, price_range:'$4.50–$8',instagram:'@beanery_coffee',     plan:'free' },
    { email:'eat@greenbowl.com.au',         trading_name:'Green Bowl',        suburb:'Prospect',      state:'SA', bio:'Wholesome vegan and plant-based street food made fresh on-site.',      cuisine_tags:'["Vegan"]',           setup_type:'Pop-up Stall',stall_w:3,   stall_d:2,   power:0, water:1, price_range:'$12–$18', instagram:'@greenbowl_sa',       plan:'free' },
    { email:'hey@brewskiburgers.com.au',    trading_name:'Brewski Burgers',   suburb:'Port Adelaide', state:'SA', bio:"Port Adelaide's premier burger truck — smash burgers, SA farm beef.",  cuisine_tags:'["Burgers"]',         setup_type:'Food Truck',  stall_w:3,   stall_d:6,   power:0, water:0, price_range:'$12–$22', instagram:'@brewski_burgers',    plan:'free' },
    { email:'catch@oceanandfire.com.au',    trading_name:'Ocean & Fire',      suburb:'Glenelg',       state:'SA', bio:'Premium seafood sourced directly from SA fishermen — grilled fresh.',  cuisine_tags:'["Seafood"]',         setup_type:'Pop-up Stall',stall_w:3,   stall_d:3,   power:1, water:1, price_range:'$14–$28', instagram:'@oceanandfire_sa',    plan:'pro'  },
    { email:'churros@thechurrostand.com.au',trading_name:'The Churro Stand',  suburb:'Adelaide CBD',  state:'SA', bio:'Hot fresh churros with a dozen dipping sauces and creative toppings.', cuisine_tags:'["Desserts"]',        setup_type:'Cart',        stall_w:2,   stall_d:1.5, power:1, water:0, price_range:'$6–$12',  instagram:'@thechurrostand',     plan:'free' },
    { email:'hello@punjabpalace.com.au',    trading_name:'Punjab Palace',     suburb:'Elizabeth',     state:'SA', bio:'Authentic Punjabi cooking — slow-cooked curries, tandoor naan, biryani.',cuisine_tags:'["Indian"]',         setup_type:'Food Truck',  stall_w:3,   stall_d:5,   power:0, water:0, price_range:'$10–$18', instagram:'@punjabpalace_adl',   plan:'free' },
    { email:'sip@pressedandbrewed.com.au',  trading_name:'Pressed & Brewed',  suburb:'Burnside',      state:'SA', bio:'Cold-pressed juices and filter coffee. All juice pressed fresh on-site.',cuisine_tags:'["Coffee & Drinks"]',setup_type:'Cart',        stall_w:1.5, stall_d:1.5, power:1, water:1, price_range:'$5–$10',  instagram:'@pressedandbrewed',   plan:'free' },
  ]) {
    const row = await _uid2.get(v.email);
    if (row) await _sv2.run({ user_id: row.id, trading_name: v.trading_name, suburb: v.suburb, state: v.state, bio: v.bio, cuisine_tags: v.cuisine_tags, setup_type: v.setup_type, stall_w: v.stall_w, stall_d: v.stall_d, power: v.power, water: v.water, price_range: v.price_range, instagram: v.instagram, plan: v.plan });
  }
  // Any remaining vendor users without a record get a placeholder
  const orphans = await prepare(`SELECT u.id, u.first_name, u.last_name FROM users u LEFT JOIN vendors v ON v.user_id=u.id WHERE u.role='vendor' AND v.id IS NULL`).all();
  for (const u of orphans) {
    await _sv2.run({ user_id: u.id, trading_name: `${u.first_name} ${u.last_name}`.trim() || 'Vendor', suburb: null, state: null, bio: null, cuisine_tags: '[]', setup_type: null, stall_w: null, stall_d: null, power: 0, water: 0, price_range: null, instagram: null, plan: 'free' });
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

// ── Mark schema as current so migrations are skipped on next boot ─────────────
await _safeExec(`CREATE TABLE IF NOT EXISTS _schema_meta (v INTEGER)`);
await _safeExec(`DELETE FROM _schema_meta`);
await prepare(`INSERT INTO _schema_meta (v) VALUES (?)`).run(SCHEMA_VERSION);

} // end if (_schemaVersion < SCHEMA_VERSION)

// ── Prepared statements ──────────────────────────────────────────────────────
export const stmts = {
  // users
  createUser:     prepare(`INSERT INTO users (email,password_hash,first_name,last_name,role) VALUES (@email,@password_hash,@first_name,@last_name,@role)`),
  getUserByEmail: prepare(`SELECT * FROM users WHERE email = ?`),
  getUserById:    prepare(`SELECT * FROM users WHERE id = ?`),
  setUserStatus:  prepare(`UPDATE users SET status = ? WHERE id = ?`),

  // vendors
  createVendor: prepare(`
    INSERT INTO vendors (user_id,trading_name,abn,abn_verified,mobile,state,suburb,bio,
      cuisine_tags,setup_type,stall_w,stall_d,power,water,price_range,instagram,plan)
    VALUES (@user_id,@trading_name,@abn,@abn_verified,@mobile,@state,@suburb,@bio,
      @cuisine_tags,@setup_type,@stall_w,@stall_d,@power,@water,@price_range,@instagram,@plan)
  `),
  getVendorByUserId: prepare(`SELECT * FROM vendors WHERE user_id = ?`),
  allVendors: prepare(`SELECT u.id as user_id, COALESCE(v.trading_name, u.first_name||' '||u.last_name) as trading_name, u.email, u.first_name, u.last_name, u.status, u.created_at as joined, v.abn, COALESCE(v.plan,'free') as plan, v.suburb, v.state, v.id as vid, v.created_at FROM users u LEFT JOIN vendors v ON v.user_id=u.id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=u.id) WHERE u.role='vendor' ORDER BY u.id DESC`),
  vendorsByStatus: prepare(`SELECT u.id as user_id, COALESCE(v.trading_name, u.first_name||' '||u.last_name) as trading_name, u.email, u.first_name, u.last_name, u.status, u.created_at as joined, v.abn, COALESCE(v.plan,'free') as plan, v.suburb, v.state, v.id as vid, v.created_at FROM users u LEFT JOIN vendors v ON v.user_id=u.id AND v.id=(SELECT MIN(id) FROM vendors WHERE user_id=u.id) WHERE u.role='vendor' AND u.status=? ORDER BY u.id DESC`),

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
  updateUserPassword:              prepare(`UPDATE users SET password_hash=? WHERE id=?`),
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

  // all users (admin)
  allUsers:    prepare(`SELECT id,email,first_name,last_name,role,status,email_verified,phone_verified,created_at FROM users ORDER BY created_at DESC`),
  usersByRole: prepare(`SELECT id,email,first_name,last_name,role,status,email_verified,phone_verified,created_at FROM users WHERE role=? ORDER BY created_at DESC`),
  updateUserRole: prepare(`UPDATE users SET role=? WHERE id=?`),

  // all applications (admin)
  allApplications:          prepare(`SELECT ea.id,ea.event_id,ea.vendor_user_id,ea.status,ea.message,ea.created_at,ea.spot_number,e.name as event_name,e.slug,e.category,e.date_sort,e.organiser_name,u.email as vendor_email,v.trading_name FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id ORDER BY ea.created_at DESC`),
  applicationsByStatus:     prepare(`SELECT ea.id,ea.event_id,ea.vendor_user_id,ea.status,ea.message,ea.created_at,ea.spot_number,e.name as event_name,e.slug,e.category,e.date_sort,e.organiser_name,u.email as vendor_email,v.trading_name FROM event_applications ea JOIN events e ON ea.event_id=e.id JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id WHERE ea.status=? ORDER BY ea.created_at DESC`),

  // featured
  featuredEvents:    prepare(`SELECT id,name,slug,category,suburb,state,date_sort,organiser_name,featured FROM events WHERE featured=1 ORDER BY date_sort ASC`),
  featuredVendors:   prepare(`SELECT v.user_id,v.trading_name,v.cuisine_tags,v.suburb,v.state,v.featured FROM vendors v JOIN users u ON v.user_id=u.id WHERE v.featured=1 AND u.status='active' ORDER BY v.trading_name ASC`),
  setEventFeatured:  prepare(`UPDATE events SET featured=? WHERE id=?`),
  setVendorFeatured: prepare(`UPDATE vendors SET featured=? WHERE user_id=?`),

  // events
  allEvents:         prepare(`SELECT * FROM events WHERE status != 'deleted' ORDER BY date_sort ASC`),
  publishedEvents:   prepare(`SELECT * FROM events WHERE status='published' ORDER BY date_sort ASC`),
  getEventBySlug:    prepare(`SELECT * FROM events WHERE slug=? AND status='published'`),
  getEventById:      prepare(`SELECT * FROM events WHERE id=?`),
  getApprovedVendorsByEvent: prepare(`SELECT v.user_id,v.trading_name,v.cuisine_tags,v.setup_type FROM event_applications ea JOIN vendors v ON v.user_id=ea.vendor_user_id WHERE ea.event_id=? AND ea.status='approved' ORDER BY ea.approved_at ASC`),
  countOrgEvents:    prepare(`SELECT COUNT(*) as n FROM events WHERE organiser_user_id=? AND status='published'`),
  updateEventStatus: prepare(`UPDATE events SET status=? WHERE id=?`),
  updateEvent:       prepare(`UPDATE events SET name=@name,category=@category,suburb=@suburb,state=@state,venue_name=@venue_name,date_sort=@date_sort,date_end=@date_end,date_text=@date_text,description=@description,stalls_available=@stalls_available,stall_fee_min=@stall_fee_min,stall_fee_max=@stall_fee_max,deadline=@deadline,cover_image=@cover_image WHERE id=@id`),
  deleteEvent:       prepare(`DELETE FROM events WHERE id=?`),
  countEvents:       prepare(`SELECT COUNT(*) as n FROM events WHERE status='published'`),
  countEventsByCategory: prepare(`SELECT COALESCE(category,'Other') as category, COUNT(*) as n FROM events WHERE status='published' GROUP BY category ORDER BY n DESC`),

  // vendor/organiser detail (admin)
  getVendorDetail:    prepare(`SELECT v.*,u.email,u.first_name,u.last_name,u.status,u.role,u.created_at FROM vendors v JOIN users u ON v.user_id=u.id WHERE v.user_id=?`),
  getOrganiserDetail: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.role,u.created_at FROM organisers o JOIN users u ON o.user_id=u.id WHERE o.user_id=?`),

  // payments
  getPaymentsByUser: prepare(`SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC`),
  createPayment:     prepare(`INSERT INTO payments (user_id,plan,amount,currency,status,description) VALUES (@user_id,@plan,@amount,@currency,@status,@description)`),

  // update profiles (admin)
  updateUserProfile:      prepare(`UPDATE users SET first_name=@first_name,last_name=@last_name,email=@email,status=@status WHERE id=@id`),
  updateVendorProfile:    prepare(`UPDATE vendors SET trading_name=@trading_name,mobile=@mobile,suburb=@suburb,state=@state,bio=@bio,plan=@plan,instagram=@instagram,setup_type=@setup_type,stall_w=@stall_w,stall_d=@stall_d,power=@power,water=@water,price_range=@price_range,abn=@abn WHERE user_id=@user_id`),
  updateVendorProfileSelf: prepare(`UPDATE vendors SET trading_name=@trading_name,mobile=@mobile,suburb=@suburb,state=@state,bio=@bio,instagram=@instagram,setup_type=@setup_type,stall_w=@stall_w,stall_d=@stall_d,power=@power,water=@water,price_range=@price_range,cuisine_tags=@cuisine_tags WHERE user_id=@user_id`),
  updateVendorPhotos:     prepare(`UPDATE vendors SET photos=@photos WHERE user_id=@user_id`),
  updateVendorDoc:        prepare(`UPDATE vendors SET food_safety_url=@food_safety_url,pli_url=@pli_url,council_url=@council_url WHERE user_id=@user_id`),
  updateOrganiserProfile: prepare(`UPDATE organisers SET org_name=@org_name,phone=@phone,website=@website,suburb=@suburb,state=@state,bio=@bio,event_scale=@event_scale,stall_range=@stall_range,abn=@abn WHERE user_id=@user_id`),
  updateOrganiserProfileSelf: prepare(`UPDATE organisers SET org_name=@org_name,bio=@bio,website=@website WHERE user_id=@user_id`),

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
  updateApplicationStatus: prepare(`UPDATE event_applications SET status=? WHERE id=?`),
  setApplicationSpot:      prepare(`UPDATE event_applications SET spot_number=?,approved_at=datetime('now') WHERE id=?`),
  countApprovedByEvent:    prepare(`SELECT COUNT(*) as n FROM event_applications WHERE event_id=? AND status='approved'`),
  withdrawApplication:     prepare(`UPDATE event_applications SET status='withdrawn' WHERE event_id=? AND vendor_user_id=?`),

  // organiser events
  createEvent:        prepare(`INSERT INTO events (slug,name,category,suburb,state,date_sort,date_end,date_text,description,stalls_available,stall_fee_min,stall_fee_max,deadline,organiser_name,organiser_user_id,venue_name,cover_image) VALUES (@slug,@name,@category,@suburb,@state,@date_sort,@date_end,@date_text,@description,@stalls_available,@stall_fee_min,@stall_fee_max,@deadline,@organiser_name,@organiser_user_id,@venue_name,@cover_image)`),
  getOrganiserEvents: prepare(`SELECT * FROM events WHERE organiser_user_id=? ORDER BY date_sort ASC`),
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
    SELECT mt.*, v.trading_name as vendor_name, o.org_name as organiser_name
    FROM message_threads mt
    LEFT JOIN vendors v ON v.user_id = mt.vendor_user_id
    LEFT JOIN organisers o ON o.user_id = mt.organiser_user_id
    WHERE mt.thread_key = ?
  `),
  // LEFT JOINs so threads show even if vendor/organiser profile row is missing
  getThreadsForUser: prepare(`
    SELECT mt.thread_key, mt.vendor_user_id, mt.organiser_user_id,
      v.trading_name as vendor_name, o.org_name as organiser_name,
      (SELECT body FROM messages m2 WHERE m2.thread_key = mt.thread_key ORDER BY m2.id DESC LIMIT 1) as last_body,
      (SELECT m2.created_at FROM messages m2 WHERE m2.thread_key = mt.thread_key ORDER BY m2.id DESC LIMIT 1) as last_at
    FROM message_threads mt
    LEFT JOIN vendors v ON v.user_id = mt.vendor_user_id
    LEFT JOIN organisers o ON o.user_id = mt.organiser_user_id
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

  // organiser settings
  updateOrganiserSettings: prepare(`UPDATE organisers SET notif_new_apps=@notif_new_apps,notif_deadlines=@notif_deadlines,notif_messages=@notif_messages,notif_payments=@notif_payments WHERE user_id=@user_id`),
  pauseOrganiser:          prepare(`UPDATE organisers SET paused=? WHERE user_id=?`),

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

  // vendor calendar (approved apps with future events)
  getVendorCalendar:   prepare(`SELECT ea.*,e.name as event_name,e.date_sort,e.date_end,e.suburb,e.state,e.category FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE ea.vendor_user_id=? ORDER BY e.date_sort ASC`),

  // vendor market history (approved apps for past events)
  getVendorHistory:    prepare(`SELECT ea.*,e.name as event_name,e.date_sort,e.suburb,e.state,e.category,e.organiser_name FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE ea.vendor_user_id=? AND ea.status='approved' ORDER BY e.date_sort DESC`),

  // vendor settings
  updateVendorSettings: prepare(`UPDATE vendors SET notif_apps=@notif_apps,notif_docs=@notif_docs,notif_reviews=@notif_reviews,notif_payments=@notif_payments WHERE user_id=@user_id`),
  pauseVendor:          prepare(`UPDATE vendors SET paused=? WHERE user_id=?`),

  // subscription / application quota
  getVendorSubscription:     prepare(`SELECT plan,apps_this_month,apps_reset_month,trial_ends_at,subscription_status FROM vendors WHERE user_id=?`),
  incrementAppsThisMonth:    prepare(`UPDATE vendors SET apps_this_month=apps_this_month+1, apps_reset_month=? WHERE user_id=?`),
  resetAndIncrementApps:     prepare(`UPDATE vendors SET apps_this_month=1, apps_reset_month=? WHERE user_id=?`),
  resetAppsCounter:          prepare(`UPDATE vendors SET apps_this_month=0, apps_reset_month=? WHERE user_id=?`),

  // announcements
  createAnnouncement:   prepare(`INSERT INTO announcements (subject,body,audience,created_by) VALUES (@subject,@body,@audience,@created_by)`),
  getAnnouncements:     prepare(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50`),
  getAnnouncementsFor:  prepare(`SELECT * FROM announcements WHERE audience='all' OR audience=? ORDER BY created_at DESC LIMIT 20`),
  getRecentAnnouncements: prepare(`SELECT * FROM announcements WHERE (audience='all' OR audience=?) AND created_at > datetime('now','-30 days') ORDER BY created_at DESC`),

  // menu items
  getMenuItems:       prepare(`SELECT * FROM menu_items WHERE vendor_user_id=? ORDER BY is_signature DESC, sort_order ASC, id ASC`),
  getMenuItemById:    prepare(`SELECT * FROM menu_items WHERE id=? AND vendor_user_id=?`),
  createMenuItem:     prepare(`INSERT INTO menu_items (vendor_user_id,name,description,price_type,price_min,price_max,category,photo_url,available,seasonal,is_signature,sort_order) VALUES (@vendor_user_id,@name,@description,@price_type,@price_min,@price_max,@category,@photo_url,@available,@seasonal,@is_signature,(SELECT COALESCE(MAX(sort_order),0)+1 FROM menu_items WHERE vendor_user_id=@vendor_user_id))`),
  updateMenuItem:     prepare(`UPDATE menu_items SET name=@name,description=@description,price_type=@price_type,price_min=@price_min,price_max=@price_max,category=@category,photo_url=@photo_url,available=@available,seasonal=@seasonal,is_signature=@is_signature WHERE id=@id AND vendor_user_id=@vendor_user_id`),
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
  getFollowedVendors:  prepare(`SELECT fv.*,v.trading_name,v.cuisine_tags,v.suburb,v.state FROM followed_vendors fv JOIN vendors v ON v.user_id=fv.vendor_user_id WHERE fv.user_id=? ORDER BY fv.created_at DESC`),
  followVendor:        prepare(`INSERT OR IGNORE INTO followed_vendors (user_id,vendor_user_id) VALUES (?,?)`),
  unfollowVendor:      prepare(`DELETE FROM followed_vendors WHERE user_id=? AND vendor_user_id=?`),
  isVendorFollowed:    prepare(`SELECT 1 FROM followed_vendors WHERE user_id=? AND vendor_user_id=?`),
  countFollowers:      prepare(`SELECT COUNT(*) as n FROM followed_vendors WHERE vendor_user_id=?`),

  // public vendors
  publicVendors: prepare(`
    SELECT v.user_id,v.trading_name,v.suburb,v.state,v.bio,v.cuisine_tags,
           v.setup_type,v.stall_w,v.stall_d,v.power,v.water,v.price_range,
           v.instagram,v.plan,u.status,u.avatar_url
    FROM vendors v JOIN users u ON v.user_id=u.id
    WHERE u.status='active' ORDER BY
      CASE v.plan WHEN 'growth' THEN 0 WHEN 'pro' THEN 1 ELSE 2 END ASC,
      v.created_at ASC
  `),
  publicVendorById: prepare(`
    SELECT v.*,u.status,u.first_name,u.last_name,u.avatar_url
    FROM vendors v JOIN users u ON v.user_id=u.id
    WHERE v.user_id=? AND u.status='active'
  `),
};

// ── Transactions ─────────────────────────────────────────────────────────────
export const txSignupVendor    = _txSignupVendor;
export const txSignupOrganiser = _txSignupOrganiser;
export const txSignupFoodie    = _txSignupFoodie;

export default _client ?? _localDb;
