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
}

// ── Schema + seed guard ──────────────────────────────────────────────────────
let _needsSeed = false;
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
await _safeExec(`ALTER TABLE vendors ADD COLUMN photos TEXT DEFAULT '[]'`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN food_safety_url TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN pli_url TEXT`);
await _safeExec(`ALTER TABLE vendors ADD COLUMN council_url TEXT`);
await _safeExec(`ALTER TABLE events ADD COLUMN date_end TEXT`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN spot_number INTEGER`);
await _safeExec(`ALTER TABLE event_applications ADD COLUMN approved_at DATETIME`);
// Deduplicate organisers rows (caused by missing UNIQUE constraint on user_id)
await _safeExec(`DELETE FROM organisers WHERE id NOT IN (SELECT MIN(id) FROM organisers GROUP BY user_id)`);
// Add unique index so this can never happen again
await _safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organisers_user_id ON organisers(user_id)`);

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

// Link seed events to their organiser accounts by matching organiser_name → org_name.
// Runs unconditionally so it also repairs any existing rows with organiser_user_id=null.
await _safeExec(`
  UPDATE events
  SET organiser_user_id = (
    SELECT o.user_id FROM organisers o WHERE o.org_name = events.organiser_name LIMIT 1
  )
  WHERE organiser_user_id IS NULL
`);

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
  allVendors: prepare(`SELECT v.*,u.email,u.first_name,u.last_name,u.status,u.created_at as joined FROM vendors v JOIN users u ON v.user_id=u.id ORDER BY v.created_at DESC`),
  vendorsByStatus: prepare(`SELECT v.*,u.email,u.first_name,u.last_name,u.status,u.created_at as joined FROM vendors v JOIN users u ON v.user_id=u.id WHERE u.status=? ORDER BY v.created_at DESC`),

  // organisers
  createOrganiser: prepare(`
    INSERT INTO organisers (user_id,org_name,abn,abn_verified,website,state,suburb,phone,bio,
      event_types,event_scale,stall_range,referral)
    VALUES (@user_id,@org_name,@abn,@abn_verified,@website,@state,@suburb,@phone,@bio,
      @event_types,@event_scale,@stall_range,@referral)
  `),
  getOrganiserByUserId: prepare(`SELECT * FROM organisers WHERE user_id = ?`),
  allOrganisers: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.created_at as joined FROM organisers o JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC`),
  organisersByStatus: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.created_at as joined FROM organisers o JOIN users u ON o.user_id=u.id WHERE u.status=? ORDER BY o.created_at DESC`),

  // admin actions
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

  // events
  allEvents:         prepare(`SELECT * FROM events WHERE status != 'deleted' ORDER BY date_sort ASC`),
  publishedEvents:   prepare(`SELECT * FROM events WHERE status='published' ORDER BY date_sort ASC`),
  getEventBySlug:    prepare(`SELECT * FROM events WHERE slug=? AND status='published'`),
  getEventById:      prepare(`SELECT * FROM events WHERE id=?`),
  updateEventStatus: prepare(`UPDATE events SET status=? WHERE id=?`),
  updateEvent:       prepare(`UPDATE events SET name=@name,category=@category,suburb=@suburb,state=@state,venue_name=@venue_name,date_sort=@date_sort,date_end=@date_end,date_text=@date_text,description=@description,stalls_available=@stalls_available WHERE id=@id`),
  deleteEvent:       prepare(`DELETE FROM events WHERE id=?`),
  countEvents:       prepare(`SELECT COUNT(*) as n FROM events WHERE status='published'`),

  // vendor/organiser detail (admin)
  getVendorDetail:    prepare(`SELECT v.*,u.email,u.first_name,u.last_name,u.status,u.role,u.created_at FROM vendors v JOIN users u ON v.user_id=u.id WHERE v.user_id=?`),
  getOrganiserDetail: prepare(`SELECT o.*,u.email,u.first_name,u.last_name,u.status,u.role,u.created_at FROM organisers o JOIN users u ON o.user_id=u.id WHERE o.user_id=?`),

  // payments
  getPaymentsByUser: prepare(`SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC`),
  createPayment:     prepare(`INSERT INTO payments (user_id,plan,amount,currency,status,description) VALUES (@user_id,@plan,@amount,@currency,@status,@description)`),

  // update profiles (admin)
  updateUserProfile:      prepare(`UPDATE users SET first_name=@first_name,last_name=@last_name,email=@email,status=@status WHERE id=@id`),
  updateVendorProfile:    prepare(`UPDATE vendors SET trading_name=@trading_name,mobile=@mobile,suburb=@suburb,state=@state,bio=@bio,plan=@plan,instagram=@instagram,setup_type=@setup_type,stall_w=@stall_w,stall_d=@stall_d,power=@power,water=@water,price_range=@price_range,abn=@abn WHERE user_id=@user_id`),
  updateVendorPhotos:     prepare(`UPDATE vendors SET photos=@photos WHERE user_id=@user_id`),
  updateVendorDoc:        prepare(`UPDATE vendors SET food_safety_url=@food_safety_url,pli_url=@pli_url,council_url=@council_url WHERE user_id=@user_id`),
  updateOrganiserProfile: prepare(`UPDATE organisers SET org_name=@org_name,phone=@phone,website=@website,suburb=@suburb,state=@state,bio=@bio,event_scale=@event_scale,stall_range=@stall_range,abn=@abn WHERE user_id=@user_id`),

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
  getApplicationsByVendor: prepare(`SELECT ea.*,e.name as event_name,e.category,e.suburb,e.state,e.date_sort,e.date_text,e.organiser_name FROM event_applications ea JOIN events e ON ea.event_id=e.id WHERE ea.vendor_user_id=? ORDER BY ea.created_at DESC`),
  getApplicationsByEvent:  prepare(`SELECT ea.*,u.first_name,u.last_name,u.email,v.trading_name,v.mobile,v.suburb as v_suburb,v.state as v_state,v.bio,v.cuisine_tags,v.plan,v.instagram,v.setup_type,v.stall_w,v.stall_d,v.power,v.water,v.price_range FROM event_applications ea JOIN users u ON ea.vendor_user_id=u.id JOIN vendors v ON v.user_id=u.id WHERE ea.event_id=?`),
  updateApplicationStatus: prepare(`UPDATE event_applications SET status=? WHERE id=?`),
  setApplicationSpot:      prepare(`UPDATE event_applications SET spot_number=?,approved_at=datetime('now') WHERE id=?`),
  countApprovedByEvent:    prepare(`SELECT COUNT(*) as n FROM event_applications WHERE event_id=? AND status='approved'`),
  withdrawApplication:     prepare(`UPDATE event_applications SET status='withdrawn' WHERE event_id=? AND vendor_user_id=?`),

  // organiser events
  createEvent:        prepare(`INSERT INTO events (slug,name,category,suburb,state,date_sort,date_end,date_text,description,stalls_available,organiser_name,organiser_user_id,venue_name) VALUES (@slug,@name,@category,@suburb,@state,@date_sort,@date_end,@date_text,@description,@stalls_available,@organiser_name,@organiser_user_id,@venue_name)`),
  getOrganiserEvents: prepare(`SELECT * FROM events WHERE organiser_user_id=? ORDER BY date_sort ASC`),

  // public vendors
  publicVendors: prepare(`
    SELECT v.user_id,v.trading_name,v.suburb,v.state,v.bio,v.cuisine_tags,
           v.setup_type,v.stall_w,v.stall_d,v.power,v.water,v.price_range,
           v.instagram,v.plan,u.status
    FROM vendors v JOIN users u ON v.user_id=u.id
    WHERE u.status='active' ORDER BY v.plan DESC,v.created_at ASC
  `),
  publicVendorById: prepare(`
    SELECT v.*,u.status,u.first_name,u.last_name
    FROM vendors v JOIN users u ON v.user_id=u.id
    WHERE v.user_id=? AND u.status='active'
  `),
};

// ── Transactions ─────────────────────────────────────────────────────────────
export const txSignupVendor    = _txSignupVendor;
export const txSignupOrganiser = _txSignupOrganiser;

export default _client ?? _localDb;
