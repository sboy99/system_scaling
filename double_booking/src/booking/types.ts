export type TBooking = {
  id: string;
  userId: number;
  roomId: number;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type TCreateBookingRequestDTO = {
  userId: number;
  roomId: number;
  startTime: Date;
  endTime: Date;
};

export type TCreateBookingResponseDTO = {
  bookingId: string;
};
