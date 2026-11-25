// Log leftovers after a meal and feed them back into the dish rates (FR-19, FR-20)
const pool = require("../db/pool");
const { recalibrateSlot } = require("./recalibrate");
const { LEFTOVER_SHARE, preparedQuantity, updatedRate } = require("./wasteMath");

class WasteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// entries: [{ dish_id, level }] - one per dish served in the slot
async function logWaste(slotId, entries) {
  const { rows: slots } = await pool.query(
    "SELECT slot_id, NOW() > service_ends_at AS over FROM meal_slots WHERE slot_id = $1",
    [slotId]
  );
  if (!slots[0]) throw new WasteError(404, "Meal not found");
  if (!slots[0].over) throw new WasteError(409, "Leftovers can be logged once service has closed");

  // make sure actual attendance is known before learning from it
  await recalibrateSlot(slotId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: dishes } = await client.query(
      `SELECT sd.dish_id, d.name, d.unit, d.consumption_rate, sd.recommended_qty,
              sd.first_batch_qty, sd.held_back_share
       FROM slot_dishes sd JOIN dishes d ON d.dish_id = sd.dish_id
       WHERE sd.slot_id = $1 FOR UPDATE OF d`,
      [slotId]
    );

    const byDish = new Map(entries.map((e) => [Number(e.dish_id), e.level]));
    for (const d of dishes) {
      const level = byDish.get(d.dish_id);
      if (!LEFTOVER_SHARE.hasOwnProperty(level)) {
        throw new WasteError(400, `Choose a leftover level for ${d.name}`);
      }
    }

    const { rows: already } = await client.query("SELECT 1 FROM waste_logs WHERE slot_id = $1 LIMIT 1", [slotId]);
    if (already[0]) throw new WasteError(409, "Leftovers for this meal have already been logged");

    const { rows: pred } = await client.query(
      "SELECT actual_attendance FROM attendance_predictions WHERE slot_id = $1",
      [slotId]
    );
    const attendance = pred[0] ? pred[0].actual_attendance : null;

    const changes = [];
    for (const d of dishes) {
      const level = byDish.get(d.dish_id);
      await client.query(
        "INSERT INTO waste_logs (slot_id, dish_id, leftover_level) VALUES ($1, $2, $3)",
        [slotId, d.dish_id, level]
      );

      if (d.recommended_qty === null) continue; // never forecast, nothing to compare with
      const oldRate = Number(d.consumption_rate);
      const result = updatedRate(oldRate, preparedQuantity(d, d.held_back_share), level, attendance);
      if (!result) continue;

      await client.query("UPDATE dishes SET consumption_rate = $2 WHERE dish_id = $1", [d.dish_id, result.rate]);
      await client.query(
        `INSERT INTO dish_rate_history (dish_id, slot_id, old_rate, observed_rate, new_rate)
         VALUES ($1, $2, $3, $4, $5)`,
        [d.dish_id, slotId, oldRate, result.observed, result.rate]
      );
      changes.push({ dish: d.name, unit: d.unit, oldRate, newRate: result.rate, level });
    }

    // Completed -> WasteLogged -> ModelUpdated (SRS fig 5.9)
    await client.query("UPDATE meal_slots SET state = 'waste_logged' WHERE slot_id = $1", [slotId]);
    await client.query("UPDATE meal_slots SET state = 'model_updated' WHERE slot_id = $1", [slotId]);

    await client.query("COMMIT");
    return { slot_id: Number(slotId), attendance, changes };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { logWaste, WasteError };
