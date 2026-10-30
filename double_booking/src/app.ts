import express from "express";
import { exceptionHandler } from "./middleware.js";
import { createBookingHandler } from "./booking/handler.js";
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.route("/bookings").post(createBookingHandler);
app.use(exceptionHandler);

export function startServer() {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
