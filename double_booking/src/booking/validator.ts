import { z } from "zod";
import { TCreateBookingRequestDTO, TCreateBookingResponseDTO } from "./types.js";

export async function validateBookingRequest(body: unknown): Promise<TCreateBookingRequestDTO> {
  const schema = z
    .object({
      userId: z.number(),
      roomId: z.number(),
      startTime: z.coerce.date(),
      endTime: z.coerce.date(),
    })
    .refine((data) => data.startTime < data.endTime, {
      message: "endTime must be after startTime",
      path: ["endTime"],
    });

  return schema.parse(body);
}

export async function validateBookingResponse(body: unknown): Promise<TCreateBookingResponseDTO> {
  const schema = z.object({
    bookingId: z.string().min(1),
  });

  return schema.parse(body);
}
