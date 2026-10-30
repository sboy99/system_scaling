/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Benchmark for POST /bookings
 *
 * Usage:
 *   npx tsx benchmark.ts [options]
 *
 * Options:
 *   --url <url>            Endpoint (default http://localhost:3000/bookings)
 *   --requests <n>         Total requests (default 1000)
 *   --concurrency <n>      Requests in flight at once (default 100)
 *   --scenario <name>      contention | distinct | mixed (default contention)
 *   --rooms <n>            Rooms used by "mixed" (default 10)
 *   --slots <n>            Time slots per room used by "mixed" (default 10)
 *   --timeout <ms>         Per-request timeout (default 10000)
 *   --reset                DELETE FROM bookings before the run (needs PG* env vars)
 *   --verify               Count rows in the database after the run (needs PG* env vars)
 *
 * Scenarios:
 *   contention  every request books the same room and slot -> expect exactly 1 created
 *   distinct    every request books its own slot           -> expect all created
 *   mixed       random room + slot from rooms x slots      -> expect created = slots actually used
 */

import "dotenv/config";

type Scenario = "contention" | "distinct" | "mixed";

interface Options {
  url: string;
  requests: number;
  concurrency: number;
  scenario: Scenario;
  rooms: number;
  slots: number;
  timeout: number;
  reset: boolean;
  verify: boolean;
}

interface Payload {
  roomId: number;
  userId: number;
  startTime: string;
  endTime: string;
}

interface Result {
  status: number; // 0 = network error / timeout
  ms: number;
  error?: string;
}

// ---------- options ----------

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const num = (name: string, def: number) => {
    const v = get(name);
    const n = v === undefined ? def : Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number`);
    return Math.floor(n);
  };

  const scenario = (get("scenario") ?? "contention") as Scenario;
  if (!["contention", "distinct", "mixed"].includes(scenario)) {
    throw new Error("--scenario must be contention, distinct or mixed");
  }

  return {
    url: get("url") ?? "http://localhost:8000/bookings",
    requests: num("requests", 1000),
    concurrency: num("concurrency", 100),
    scenario,
    rooms: num("rooms", 10),
    slots: num("slots", 10),
    timeout: num("timeout", 10_000),
    reset: has("reset"),
    verify: has("verify"),
  };
}

// ---------- payloads ----------

const HOUR = 3_600_000;

// Random base day far in the future, so repeated runs don't collide with old rows.
const BASE = Date.UTC(2030, 0, 1) + Math.floor(Math.random() * 50_000) * 24 * HOUR;
const WARMUP_ROOM = 999_999;

function slot(roomId: number, slotIndex: number, userId: number): Payload {
  const start = BASE + slotIndex * HOUR;
  return {
    roomId,
    userId,
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + HOUR).toISOString(),
  };
}

function buildPayloads(o: Options): { payloads: Payload[]; expectedCreated: number } {
  const payloads: Payload[] = [];

  if (o.scenario === "contention") {
    for (let i = 0; i < o.requests; i++) payloads.push(slot(1, 0, i + 1));
    return { payloads, expectedCreated: 1 };
  }

  if (o.scenario === "distinct") {
    for (let i = 0; i < o.requests; i++) payloads.push(slot(1 + (i % 50), i, i + 1));
    return { payloads, expectedCreated: o.requests };
  }

  const used = new Set<string>();
  for (let i = 0; i < o.requests; i++) {
    const room = 1 + Math.floor(Math.random() * o.rooms);
    const s = Math.floor(Math.random() * o.slots);
    used.add(`${room}:${s}`);
    payloads.push(slot(room, s, i + 1));
  }
  return { payloads, expectedCreated: used.size };
}

// ---------- requests ----------

async function send(url: string, body: Payload, timeout: number): Promise<Result> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    await res.arrayBuffer(); // drain the body so the connection can be reused
    return { status: res.status, ms: performance.now() - t0 };
  } catch (err: any) {
    return { status: 0, ms: performance.now() - t0, error: err?.name ?? String(err) };
  }
}

// Fixed-size worker pool: exactly `concurrency` requests in flight at any moment.
async function run(o: Options, payloads: Payload[]): Promise<Result[]> {
  const results: Result[] = new Array(payloads.length);
  let next = 0;
  let done = 0;

  const progress = setInterval(() => {
    process.stdout.write(`\r  progress: ${done}/${payloads.length}`);
  }, 250);

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= payloads.length) return;
      results[i] = await send(o.url, payloads[i]!, o.timeout);
      done++;
    }
  }

  await Promise.all(Array.from({ length: Math.min(o.concurrency, payloads.length) }, worker));
  clearInterval(progress);
  process.stdout.write(`\r  progress: ${done}/${payloads.length}\n`);
  return results;
}

// ---------- stats ----------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

const fmt = (ms: number) => `${ms.toFixed(1)} ms`;

// ---------- database helpers (optional) ----------

async function withDb<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<any>) => Promise<T>) {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ max: 1 });
  try {
    return await fn((sql, params) => pool.query(sql, params));
  } finally {
    await pool.end();
  }
}

async function countRowsForRun(maxSlots: number): Promise<number> {
  return withDb(async (q) => {
    const { rows } = await q(
      `SELECT count(*)::int AS n FROM bookings
        WHERE start_time >= $1 AND start_time < $2 AND room_id <> $3`,
      [new Date(BASE).toISOString(), new Date(BASE + maxSlots * HOUR).toISOString(), WARMUP_ROOM],
    );
    return rows[0].n as number;
  });
}

// ---------- main ----------

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const { payloads, expectedCreated } = buildPayloads(o);

  console.log("\nBooking API benchmark");
  console.log(`  url:          ${o.url}`);
  console.log(`  scenario:     ${o.scenario}`);
  console.log(`  requests:     ${o.requests}`);
  console.log(`  concurrency:  ${o.concurrency}`);
  if (o.scenario === "mixed") console.log(`  rooms x slots: ${o.rooms} x ${o.slots}`);

  if (o.reset) {
    await withDb((q) => q("DELETE FROM bookings"));
    console.log("  reset:        bookings table cleared");
  }

  // Warm-up: one request to a slot outside the run, so connection setup isn't measured.
  await send(o.url, slot(WARMUP_ROOM, 0, 0), o.timeout);

  const t0 = performance.now();
  const results = await run(o, payloads);
  const totalMs = performance.now() - t0;

  // Status breakdown
  const byStatus = new Map<number, number>();
  for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const errorsByName = new Map<string, number>();
  for (const r of results)
    if (r.error) errorsByName.set(r.error, (errorsByName.get(r.error) ?? 0) + 1);

  const created = byStatus.get(201) ?? 0;
  const conflicts = byStatus.get(409) ?? 0;
  const serverErrors = [...byStatus].filter(([s]) => s >= 500).reduce((a, [, n]) => a + n, 0);
  const networkErrors = byStatus.get(0) ?? 0;

  const lat = results.map((r) => r.ms).sort((a, b) => a - b);
  const mean = lat.reduce((a, b) => a + b, 0) / lat.length;

  console.log("\nThroughput");
  console.log(`  total time:   ${(totalMs / 1000).toFixed(2)} s`);
  console.log(`  requests/s:   ${(results.length / (totalMs / 1000)).toFixed(0)}`);

  console.log("\nLatency");
  console.log(`  min:  ${fmt(lat[0] ?? 0)}`);
  console.log(`  mean: ${fmt(mean)}`);
  console.log(`  p50:  ${fmt(percentile(lat, 50))}`);
  console.log(`  p90:  ${fmt(percentile(lat, 90))}`);
  console.log(`  p95:  ${fmt(percentile(lat, 95))}`);
  console.log(`  p99:  ${fmt(percentile(lat, 99))}`);
  console.log(`  max:  ${fmt(lat[lat.length - 1] ?? 0)}`);

  console.log("\nStatus codes");
  for (const [status, n] of [...byStatus].sort((a, b) => a[0] - b[0])) {
    const label = status === 0 ? "network/timeout" : String(status);
    console.log(`  ${label.padEnd(16)} ${n}`);
  }
  for (const [name, n] of errorsByName) console.log(`    ${name}: ${n}`);

  // Correctness checks
  console.log("\nCorrectness");
  const checks: [string, boolean][] = [
    [`created (${created}) == expected (${expectedCreated})`, created === expectedCreated],
    [`no 5xx responses (${serverErrors})`, serverErrors === 0],
    [`no network errors/timeouts (${networkErrors})`, networkErrors === 0],
    [
      `201 + 409 == requests (${created + conflicts}/${o.requests})`,
      created + conflicts === o.requests,
    ],
  ];

  if (o.verify) {
    const rows = await countRowsForRun(Math.max(o.requests, o.slots) + 1);
    checks.push([`rows in DB for this run (${rows}) == created (${created})`, rows === created]);
  }

  for (const [label, ok] of checks) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);

  const allPassed = checks.every(([, ok]) => ok);
  console.log(allPassed ? "\nAll checks passed.\n" : "\nSome checks failed.\n");
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
