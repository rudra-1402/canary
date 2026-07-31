#!/usr/bin/env node
// Snapshot / restore a Mongo database to disk as Extended JSON.
//
//   node scripts/snapshotDb.js snapshot [dbName]        -> F:/canary-snapshots/<db>-<stamp>/
//   node scripts/snapshotDb.js list
//   node scripts/snapshotDb.js restore <snapshot-dir> [dbName]
//
// Why this exists: on 2026-07-31 a `pytest` run deleted 484 500 rows from canary_dev, because
// the suite's database default was silently overridden upstream. Nothing looked dangerous and
// no prompt fired. Text-matching guards cannot catch destruction that is a side effect of a
// benign command — only a restorable copy can. This is that copy.
//
// mongodump is not installed on this machine (MongoDB server is, the tools package is not),
// hence Extended JSON via the driver's bson rather than BSON archives.

import { MongoClient } from 'mongodb';
import { EJSON } from 'bson';
import fs from 'node:fs';
import path from 'node:path';

const URI = process.env.MONGODB_URI_ADMIN || 'mongodb://127.0.0.1:27017';
const ROOT = process.env.CANARY_SNAPSHOT_DIR || 'F:/canary-snapshots';
const BATCH = 5000;

async function snapshot(dbName) {
  const client = await new MongoClient(URI).connect();
  const db = client.db(dbName);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, `${dbName}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  const manifest = { db: dbName, uri: URI, createdAt: new Date().toISOString(), collections: {} };

  for (const name of names) {
    const out = fs.createWriteStream(path.join(dir, `${name}.ejson`));
    let n = 0;
    const cursor = db.collection(name).find({}).batchSize(BATCH);
    for await (const doc of cursor) {
      out.write(EJSON.stringify(doc) + '\n');
      n += 1;
    }
    await new Promise((res) => out.end(res));
    manifest.collections[name] = n;
    console.log(`  ${name.padEnd(24)} ${n}`);
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await client.close();
  console.log(`\nSnapshot written to ${dir}`);
  return dir;
}

async function restore(dir, dbName) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const target = dbName || manifest.db;
  const client = await new MongoClient(URI).connect();
  const db = client.db(target);

  console.log(`Restoring ${dir} -> ${target} (taken ${manifest.createdAt})`);
  for (const [name, expected] of Object.entries(manifest.collections)) {
    const file = path.join(dir, `${name}.ejson`);
    if (!fs.existsSync(file)) continue;
    await db.collection(name).deleteMany({});
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (let i = 0; i < lines.length; i += BATCH) {
      const docs = lines.slice(i, i + BATCH).map((l) => EJSON.parse(l));
      if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
    }
    const actual = await db.collection(name).countDocuments();
    const mark = actual === expected ? 'ok' : `MISMATCH expected ${expected}`;
    console.log(`  ${name.padEnd(24)} ${actual} ${mark}`);
  }
  await client.close();
}

function list() {
  if (!fs.existsSync(ROOT)) return console.log(`No snapshots (${ROOT} does not exist)`);
  for (const d of fs.readdirSync(ROOT).sort()) {
    const m = path.join(ROOT, d, 'manifest.json');
    if (!fs.existsSync(m)) continue;
    const { createdAt, collections } = JSON.parse(fs.readFileSync(m, 'utf8'));
    const total = Object.values(collections).reduce((a, b) => a + b, 0);
    console.log(`${d}  ${createdAt}  ${total} docs`);
  }
}

const [cmd, arg1, arg2] = process.argv.slice(2);
if (cmd === 'snapshot') await snapshot(arg1 || 'canary_dev');
else if (cmd === 'restore') {
  if (!arg1) throw new Error('restore needs a snapshot directory');
  await restore(arg1, arg2);
} else if (cmd === 'list') list();
else {
  console.error('usage: snapshotDb.js snapshot [db] | list | restore <dir> [db]');
  process.exit(1);
}
