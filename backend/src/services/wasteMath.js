// Turning a four-point leftover estimate into a corrected per-head rate (FR-20).
// No weighing scale needed (CON-5).

// rough share of the prepared food left in the container
const LEFTOVER_SHARE = {
  empty: 0,
  almost_empty: 0.1,
  half_left: 0.5,
  mostly_full: 0.8,
};

const LEARNING_RATE = 0.2; // how far one meal moves the rate

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// what actually went in the pot: first batch plus whatever share of the held-back batch was cooked.
// If nobody recorded a decision, assume all of it was cooked.
function preparedQuantity(dish, heldBackShare) {
  const first = Number(dish.first_batch_qty);
  const total = Number(dish.recommended_qty);
  const share = heldBackShare === null || heldBackShare === undefined ? 1 : Number(heldBackShare);
  return first + share * (total - first);
}

function servedQuantity(prepared, level) {
  return prepared * (1 - LEFTOVER_SHARE[level]);
}

// new per-head rate after one meal; null if we can't learn anything
function updatedRate(oldRate, prepared, level, attendance) {
  if (!attendance || attendance <= 0 || !prepared) return null;

  const observed = servedQuantity(prepared, level) / attendance;
  let next = oldRate + LEARNING_RATE * (observed - oldRate);

  // an empty container only tells us they'd have eaten at least this much,
  // so it can push the rate up but never down
  if (level === "empty") next = Math.max(next, oldRate);

  return { observed: round3(observed), rate: round3(next) };
}

module.exports = { LEFTOVER_SHARE, LEARNING_RATE, preparedQuantity, servedQuantity, updatedRate };
