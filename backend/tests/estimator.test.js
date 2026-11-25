// Reproduces the worked example in SRS Appendix A
const { expectedAttendance, applyBuffer, dishPlan } = require("../src/services/estimator");

const fill = (n, value) => Array(n).fill(value);

const rice = { dish_id: 1, name: "Rice", unit: "kg", consumption_rate: 0.145 };
const dal = { dish_id: 2, name: "Dal", unit: "L", consumption_rate: 0.21 };

describe("Appendix A worked example", () => {
  const result = expectedAttendance({
    yes: fill(180, 0.94),
    no: fill(60, 0.08),
    none: fill(160, 0.52),
  });

  test("group contributions match table A.1", () => {
    expect(result.yesPart).toBe(169.2);
    expect(result.noPart).toBe(4.8);
    expect(result.nonePart).toBe(83.2);
  });

  test("expected attendance is 257.2, not the naive 180", () => {
    expect(result.expected).toBe(257.2);
    expect(result.yesCount).toBe(180);
  });

  test("8% buffer gives 278 students", () => {
    expect(applyBuffer(result.expected, 0.08)).toBe(278);
  });

  test("rice: 40.3 kg, first batch 30.2 kg, 10.1 kg held back", () => {
    const plan = dishPlan(278, rice, 0.75);
    expect(plan.total).toBe(40.3);
    expect(plan.firstBatch).toBe(30.2);
    expect(plan.heldBack).toBe(10.1);
  });

  test("dal: 58.4 L", () => {
    expect(dishPlan(278, dal, 0.75).total).toBe(58.4);
  });
});

describe("safety buffer (FR-12)", () => {
  test.each([
    [0, 257.2, 258],
    [0.05, 257.2, 271],
    [0.08, 257.2, 278],
    [0.15, 257.2, 296],
  ])("buffer %p on %p gives %p", (buffer, expected, result) => {
    expect(applyBuffer(expected, buffer)).toBe(result);
  });

  test("never lowers the forecast", () => {
    for (const e of [0, 12.4, 99.9, 400]) {
      expect(applyBuffer(e, 0.08)).toBeGreaterThanOrEqual(e);
    }
  });
});

describe("dish plan", () => {
  test("pieces are whole numbers and batches add up", () => {
    const roti = { dish_id: 3, name: "Roti", unit: "pcs", consumption_rate: 3.5 };
    const plan = dishPlan(278, roti, 0.75);
    expect(plan.total).toBe(973);
    expect(Number.isInteger(plan.firstBatch)).toBe(true);
    expect(plan.firstBatch + plan.heldBack).toBe(plan.total);
  });

  test("a split of 1 means everything is cooked up front", () => {
    const plan = dishPlan(278, rice, 1);
    expect(plan.heldBack).toBe(0);
  });

  test("an empty slot needs nothing", () => {
    const empty = expectedAttendance({ yes: [], no: [], none: [] });
    expect(empty.expected).toBe(0);
    expect(dishPlan(applyBuffer(0, 0.08), rice, 0.75).total).toBe(0);
  });
});
