require("dotenv").config();
const app = require("./app");
const { runHousekeeping } = require("./services/housekeeping");

const PORT = process.env.PORT || 4000;

async function housekeeping() {
  try {
    await runHousekeeping();
  } catch (err) {
    console.error("Housekeeping failed:", err.message);
  }
}

app.listen(PORT, () => {
  console.log(`MessMind API running on http://localhost:${PORT}`);
  housekeeping();
  setInterval(housekeeping, 5 * 60 * 1000);
});
