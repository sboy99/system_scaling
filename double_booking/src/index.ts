import { startServer } from "./app.js";

async function main() {
  startServer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
