/* eslint-disable @typescript-eslint/no-explicit-any */
import { PG_CHECK_VIOLATION, PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, pool } from "@/db.js";
import { BadRequestError, ConflictError } from "@/errors.js";

export async function createBookingRepository(
  userId: number,
  roomId: number,
  startTime: Date,
  endTime: Date,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [roomId]);
    const result = await client.query(
      `INSERT INTO bookings (user_id, room_id, start_time, end_time)
         VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, roomId, startTime, endTime],
    );
    await client.query("COMMIT");
    return result.rows[0].id;
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.code === PG_EXCLUSION_VIOLATION || err.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictError("Room already booked for this time");
    }
    if (err.code === PG_CHECK_VIOLATION) {
      throw new BadRequestError("endTime must be after startTime");
    }
    throw err; // handled by the error middleware in app.ts
  } finally {
    client.release();
  }
}
