const { globalStage, weightsFor, forecastStage, smoothedRate } = require("../src/services/parameters");

const defaults = { r: 0.9, f: 0.1, b: 0.65 };
const segment = { r: 0.92, f: 0.07, b: 0.55 };

function profile(overrides) {
  return {
    sample_size: 30,
    yes_total: 10,
    yes_attended: 10,
    no_total: 10,
    no_attended: 0,
    none_total: 10,
    none_attended: 5,
    none_expected: 5,
    ...overrides,
  };
}

describe("degradation ladder (table 3.1)", () => {
  test.each([
    [0, 0],
    [6, 0],
    [7, 1],
    [89, 1],
    [90, 3],
  ])("%p completed slots gives stage %p", (slots, stage) => {
    expect(globalStage(slots)).toBe(stage);
  });

  test("stage 0 uses institute-wide defaults for everyone", () => {
    const w = weightsFor(profile(), segment, 0, defaults);
    expect(w).toMatchObject({ r: 0.9, f: 0.1, b: 0.65, personal: false });
  });

  test("a student with little history inherits the segment rates", () => {
    const w = weightsFor(profile({ sample_size: 10 }), segment, 1, defaults);
    expect(w).toMatchObject({ r: 0.92, f: 0.07, b: 0.55, personal: false });
  });

  test("with enough history the student's own rates are used", () => {
    const w = weightsFor(profile({ yes_total: 20, yes_attended: 10 }), segment, 1, defaults);
    expect(w.personal).toBe(true);
    expect(w.r).toBeCloseTo((10 + 2 * 0.92) / 22, 5);
  });

  test("a group with too few observations falls back to the segment", () => {
    const w = weightsFor(profile({ no_total: 1, no_attended: 1 }), segment, 1, defaults);
    expect(w.f).toBe(0.07);
  });

  test("a student who comes more often than average gets a higher baseline", () => {
    const keen = weightsFor(profile({ none_attended: 9, none_expected: 5 }), segment, 1, defaults);
    const average = weightsFor(profile({ none_attended: 5, none_expected: 5 }), segment, 1, defaults);
    expect(keen.b).toBeGreaterThan(average.b);
    expect(average.b).toBeCloseTo(0.55, 5);
  });

  test("rates stay strictly between 0 and 1", () => {
    const w = weightsFor(profile({ yes_total: 50, yes_attended: 50, none_attended: 40, none_expected: 2 }), segment, 1, defaults);
    expect(w.r).toBeLessThan(1);
    expect(w.b).toBeLessThan(1);
  });
});

describe("smoothing", () => {
  test("one observation does not make a rate 0 or 1", () => {
    expect(smoothedRate(1, 1, 0.5)).toBeLessThan(1);
    expect(smoothedRate(0, 1, 0.5)).toBeGreaterThan(0);
  });
});

describe("reported stage", () => {
  test("stage 2 once most students have their own rates", () => {
    expect(forecastStage(1, 0.3)).toBe(1);
    expect(forecastStage(1, 0.7)).toBe(2);
    expect(forecastStage(3, 0.7)).toBe(3);
    expect(forecastStage(0, 1)).toBe(0);
  });
});
