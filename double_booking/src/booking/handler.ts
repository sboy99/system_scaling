import { Request, Response } from "express";
import { validateBookingRequest, validateBookingResponse } from "./validator.js";
import { createBookingService } from "./service.js";

export async function createBookingHandler(req: Request, res: Response) {
  const parsedBookingData = await validateBookingRequest(req.body);
  const bookingDetails = await createBookingService(parsedBookingData);
  const parsedBookingDetails = await validateBookingResponse(bookingDetails);
  res.status(201).json(parsedBookingDetails);
}
