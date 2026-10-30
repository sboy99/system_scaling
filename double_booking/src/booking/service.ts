import { TCreateBookingRequestDTO, TCreateBookingResponseDTO } from "./types.js";
import { createBookingRepository } from "./repository.js";

export async function createBookingService(
  bookingData: TCreateBookingRequestDTO,
): Promise<TCreateBookingResponseDTO> {
  const { userId, roomId, startTime, endTime } = bookingData;
  const bookingId = await createBookingRepository(userId, roomId, startTime, endTime);
  return { bookingId };
}
