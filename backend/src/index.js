require("dotenv").config();
const app = require("./app");
const { ensureUpcomingSlots, refreshSlotStates } = require("./services/slots");

const PORT = process.env.PORT || 4000;

async function housekeeping() {
  try {
    await ensureUpcomingSlots(7);
    await refreshSlotStates();
  } catch (err) {
    console.error("Slot housekeeping failed:", err.message);
  }
}

app.listen(PORT, () => {
  console.log(`MessMind API running on http://localhost:${PORT}`);
  housekeeping();
  setInterval(housekeeping, 60 * 60 * 1000);
});
