// concurrency-test.ts
const URL = "http://localhost:8000/bookings";
const payload = {
  roomId: 10,
  userId: 1,
  startTime: "2026-09-01T10:00:00Z",
  endTime: "2026-09-01T11:00:00Z",
};

async function main(n = 2000) {
  const responses = await Promise.all(
    Array.from({ length: n }, () =>
      fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),
  );

  const counts: Record<number, number> = {};
  for (const r of responses) counts[r.status] = (counts[r.status] ?? 0) + 1;

  console.log(counts); // expected: { '201': 1, '409': 49 }
  if (counts[201] !== 1) throw new Error("Double booking!");
}

main();
