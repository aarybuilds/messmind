const { preparedQuantity, servedQuantity, updatedRate } = require("../src/services/wasteMath");

const rice = { recommended_qty: 40.3, first_batch_qty: 30.2 };

describe("prepared quantity", () => {
  test("held-back batch cooked means the full amount", () => {
    expect(preparedQuantity(rice, true)).toBe(40.3);
  });

  test("held-back batch held means only the first batch", () => {
    expect(preparedQuantity(rice, false)).toBe(30.2);
  });

  test("no decision recorded falls back to the full amount", () => {
    expect(preparedQuantity(rice, null)).toBe(40.3);
  });
});

describe("served quantity", () => {
  test("half left means half was served", () => {
    expect(servedQuantity(40, "half_left")).toBe(20);
  });

  test("empty means all of it", () => {
    expect(servedQuantity(40, "empty")).toBe(40);
  });
});

describe("rate update (FR-20)", () => {
  test("Appendix A: dal half left means its rate is revised downward", () => {
    // 58.4 L prepared, half left, 271 ate -> 0.108 L each observed
    const result = updatedRate(0.21, 58.4, "half_left", 271);
    expect(result.observed).toBeCloseTo(0.108, 3);
    expect(result.rate).toBeLessThan(0.21);
    expect(result.rate).toBeGreaterThan(0.108);
  });

  test("rice almost empty barely moves the rate", () => {
    // 40.3 kg, 10% left, 271 ate -> 0.134 kg each observed
    const result = updatedRate(0.145, 40.3, "almost_empty", 271);
    expect(Math.abs(result.rate - 0.145)).toBeLessThan(0.005);
  });

  test("an empty container never lowers the rate", () => {
    const result = updatedRate(0.145, 30, "empty", 271);
    expect(result.rate).toBeGreaterThanOrEqual(0.145);
  });

  test("an empty container with more demand raises it", () => {
    const result = updatedRate(0.145, 45, "empty", 271);
    expect(result.rate).toBeGreaterThan(0.145);
  });

  test("one meal only moves the rate part of the way", () => {
    const result = updatedRate(0.2, 10, "mostly_full", 100);
    expect(result.rate).toBeGreaterThan(result.observed);
  });

  test("no attendance means nothing to learn", () => {
    expect(updatedRate(0.145, 40, "half_left", 0)).toBeNull();
    expect(updatedRate(0.145, 40, "half_left", null)).toBeNull();
  });
});
