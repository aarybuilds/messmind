// Staged cooking advice (FR-17, SRS fig 5.8).
// During service we compare check-ins with how many we'd expect by now,
// project the final turnout, and say whether to cook the held-back batch.

// Share of the day's students who have usually arrived by each point of the service window.
// Most come early: about 61% within the first 20 minutes of a 2-hour meal.
const ARRIVAL_CURVE = [
  [0, 0],
  [1 / 6, 0.61],
  [1 / 2, 0.9],
  [1, 1],
];

const DECISION_WINDOW_MIN = 20; // decide on the held-back batch within the first 20 minutes
const MIN_MINUTES = 5; // too early to say anything before this
const MIN_CHECKINS = 10;

function expectedShare(minutesIn, serviceMinutes) {
  const x = Math.min(1, Math.max(0, minutesIn / serviceMinutes));
  for (let i = 1; i < ARRIVAL_CURVE.length; i++) {
    const [x1, y1] = ARRIVAL_CURVE[i];
    if (x <= x1) {
      const [x0, y0] = ARRIVAL_CURVE[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 1;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// headcount = buffered forecast, split = first batch share,
// dishes = [{ name, unit, total, firstBatch, heldBack }]
function adviseHeldBack({ headcount, split, observed, minutesIn, serviceMinutes, dishes }) {
  const share = expectedShare(minutesIn, serviceMinutes);
  const expectedByNow = Math.round(headcount * share);
  const base = { expectedByNow, observed, projected: null, action: "wait", fraction: 0, dishes: [] };

  if (minutesIn < MIN_MINUTES || observed < MIN_CHECKINS || share === 0) {
    return { ...base, reason: "Too early to tell. Keep logging check-ins." };
  }

  const projected = Math.round(observed / share);
  const coveredByFirstBatch = headcount * split;
  const heldBackHeads = headcount - coveredByFirstBatch;
  const extraNeeded = projected - coveredByFirstBatch;

  let fraction = 0;
  if (heldBackHeads > 0 && extraNeeded > 0) {
    fraction = Math.min(1, extraNeeded / heldBackHeads);
  }

  let action;
  let reason;
  if (fraction >= 0.9) {
    action = "cook";
    fraction = 1;
    reason = `Arrivals are running ahead: ${observed} in against about ${expectedByNow} expected by now.`;
  } else if (fraction > 0.1) {
    action = "partial";
    reason = `On track for about ${projected} students. Cook part of the held-back batch.`;
  } else {
    action = "hold";
    fraction = 0;
    reason = `On track for about ${projected} students, which the first batch covers. Hold the rest.`;
  }

  const toCook = dishes.map((d) => {
    const amount = d.unit === "pcs" ? Math.round(d.heldBack * fraction) : round1(d.heldBack * fraction);
    return { name: d.name, unit: d.unit, amount };
  });

  return { ...base, projected, action, fraction: round1(fraction), reason, dishes: toCook };
}

module.exports = { ARRIVAL_CURVE, DECISION_WINDOW_MIN, expectedShare, adviseHeldBack };
