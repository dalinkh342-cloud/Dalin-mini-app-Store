import { DatabaseSync } from 'node:sqlite';

const TABLES = new Set(['leads', 'tasks', 'orders', 'drafts', 'shop_products', 'shop_promos', 'shop_threads', 'shop_messages', 'shop_orders', 'shop_requests', 'shop_qr']);

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      body TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS company_codes
      ON records(lower(json_extract(body, '$.companyCode')))
      WHERE kind = 'leads' AND json_extract(body, '$.companyCode') IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS order_charges
      ON records(json_extract(body, '$.charge'))
      WHERE kind = 'orders' AND json_extract(body, '$.charge') IS NOT NULL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      due INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'pending',
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS due_jobs ON jobs(state, type, due);
  `);
  const get = db.prepare('SELECT body FROM records WHERE kind = ? AND id = ?');
  const set = db.prepare(`INSERT INTO records(kind,id,body) VALUES (?,?,?)
    ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body`);
  const list = db.prepare('SELECT body FROM records WHERE kind = ?');
  const remove = db.prepare('DELETE FROM records WHERE kind = ? AND id = ?');
  const deleteExpiredInvites = db.prepare(`DELETE FROM records
    WHERE kind='trial_invites' AND json_extract(body, '$.expires')<=?`);
  const addJob = db.prepare('INSERT OR IGNORE INTO jobs(id,type,payload,due) VALUES (?,?,?,?)');
  const findJob = db.prepare('SELECT 1 FROM jobs WHERE id = ?');
  const markDirty = db.prepare(`INSERT INTO jobs(id,type,payload,due) VALUES (?,'notion',?,?)
    ON CONFLICT(id) DO UPDATE SET due=excluded.due, state='pending', attempts=0,
    revision=jobs.revision+1, error=NULL`);
  const jobSelect = db.prepare(`SELECT * FROM jobs
    WHERE state='pending' AND type=? AND due<=? ORDER BY due,rowid LIMIT 1`);
  const jobFinish = db.prepare(`UPDATE jobs SET state=?,error=?,attempts=attempts+1,due=?
    WHERE id=? AND revision=?`);
  const counterRead = db.prepare('SELECT value FROM metadata WHERE key=?');
  const counterWrite = db.prepare(`INSERT INTO metadata(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

  return {
    close: () => db.close(),
    transaction(work) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    get(kind, id) {
      return JSON.parse(get.get(kind, String(id))?.body || 'null');
    },
    all(kind) {
      return list.all(kind).map(row => JSON.parse(row.body));
    },
    save(kind, record, time) {
      if (!TABLES.has(kind)) throw new Error('Unknown record kind');
      set.run(kind, String(record.id), JSON.stringify(record));
      if (['leads', 'tasks', 'orders'].includes(kind)) {
        markDirty.run('notion:' + kind + ':' + record.id, JSON.stringify({ kind, id: record.id }), time);
      }
      return record;
    },
    forget(kind, id) { remove.run(kind, String(id)); },
    setLanguage(user, language) {
      set.run('preferences', String(user), JSON.stringify({ language }));
    },
    setTrialInvite(token, invite, time) {
      deleteExpiredInvites.run(time);
      set.run('trial_invites', token, JSON.stringify(invite));
    },
    readCounter(key) { return counterRead.get(key)?.value || 0; },
    setCounter(key, value) { counterWrite.run(key, value); },
    serial(key, prefix) {
      const value = this.readCounter(key) + 1;
      this.setCounter(key, value);
      return prefix + '-' + String(value).padStart(4, '0');
    },
    queue(type, id, payload, due) { addJob.run(id, type, JSON.stringify(payload), due); },
    hasJob(id) { return Boolean(findJob.get(id)); },
    due(type, time) {
      const row = jobSelect.get(type, time);
      return row && { ...row, payload: JSON.parse(row.payload) };
    },
    finish(job, state, due, error = null) {
      jobFinish.run(state, error, due, job.id, job.revision);
    },
    failed() { return db.prepare("SELECT count(*) AS count FROM jobs WHERE state='failed'").get().count; },
    failedJobs() {
      return db.prepare("SELECT id, type, error FROM jobs WHERE state='failed' ORDER BY due DESC LIMIT 15").all();
    },
    retry(id, time) {
      return db.prepare("UPDATE jobs SET state='pending', attempts=0,due=?,error=NULL WHERE id=? AND state='failed'")
        .run(time, id).changes > 0;
    },
    rememberNotionPage(key, pageId) {
      if (!pageId) throw new Error('Notion returned no page id');
      set.run('notion_pages', key, JSON.stringify(pageId));
    },
  };
}
