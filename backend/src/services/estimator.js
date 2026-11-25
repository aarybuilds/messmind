// The forecast from SRS section 3.2.2. Plain functions, no database,
// so every number can be reproduced by hand (CON-2).
//
//   E   = sum of r over Y + sum of f over N + sum of b over U
//   E'  = E x (1 + beta)
//   Q_d = E' x c_d
//   B_d = sigma x Q_d

function round1(x) {
  return Math.round(x * 10) / 10;
}

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

// weights: { yes: [r...], no: [f...], none: [b...] } - one number per student
function expectedAttendance(weights) {
  const yesPart = sum(weights.yes);
  const noPart = sum(weights.no);
  const nonePart = sum(weights.none);
  return {
    yesCount: weights.yes.length,
    noCount: weights.no.length,
    noneCount: weights.none.length,
    yesPart: round1(yesPart),
    noPart: round1(noPart),
    nonePart: round1(nonePart),
    expected: round1(yesPart + noPart + nonePart),
  };
}

// Rounded up: running short costs more than a few extra plates
function applyBuffer(expected, buffer) {
  return Math.ceil(round1(expected * (1 + buffer)));
}

// Quantity for one dish in kitchen units, split into first and held-back batch.
// Pieces (roti, bread) are whole numbers, kg and litres to one decimal.
function dishPlan(headcount, dish, split) {
  const whole = dish.unit === "pcs";
  const fix = whole ? Math.ceil : round1;

  const total = fix(headcount * dish.consumption_rate);
  const firstBatch = whole ? Math.round(total * split) : round1(total * split);
  return {
    dish_id: dish.dish_id,
    name: dish.name,
    unit: dish.unit,
    total,
    firstBatch,
    heldBack: whole ? total - firstBatch : round1(total - firstBatch),
  };
}

module.exports = { round1, expectedAttendance, applyBuffer, dishPlan };
