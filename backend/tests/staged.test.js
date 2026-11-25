const { expectedShare, adviseHeldBack } = require("../src/services/staged");

const rice = { name: "Rice", unit: "kg", total: 40.3, firstBatch: 30.2, heldBack: 10.1 };
const roti = { name: "Roti", unit: "pcs", total: 973, firstBatch: 730, heldBack: 243 };

// same setup as slide 4 and SRS Appendix A: 278 planned, 75% cooked first, 2-hour service
const base = { headcount: 278, split: 0.75, serviceMinutes: 120, dishes: [rice, roti] };

describe("arrival curve", () => {
  test("about 61% have arrived 20 minutes into a 2-hour meal", () => {
    expect(expectedShare(20, 120)).toBeCloseTo(0.61, 5);
    expect(Math.round(278 * expectedShare(20, 120))).toBe(170);
  });

  test("starts at 0, ends at 1 and never goes down", () => {
    expect(expectedShare(0, 120)).toBe(0);
    expect(expectedShare(120, 120)).toBe(1);
    expect(expectedShare(500, 120)).toBe(1);
    let last = 0;
    for (let m = 0; m <= 120; m += 5) {
      const share = expectedShare(m, 120);
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
  });
});

describe("held-back batch advice (FR-17)", () => {
  test("slide 4: 196 in against 170 expected means cook all 10.1 kg", () => {
    const advice = adviseHeldBack({ ...base, observed: 196, minutesIn: 20 });
    expect(advice.expectedByNow).toBe(170);
    expect(advice.action).toBe("cook");
    expect(advice.dishes[0]).toEqual({ name: "Rice", unit: "kg", amount: 10.1 });
    expect(advice.dishes[1].amount).toBe(243);
  });

  test("arrivals well below the forecast means hold", () => {
    const advice = adviseHeldBack({ ...base, observed: 120, minutesIn: 20 });
    expect(advice.action).toBe("hold");
    expect(advice.dishes[0].amount).toBe(0);
  });

  test("slightly above the first batch means cook part of it", () => {
    // 150 / 0.61 = 246 projected; first batch covers 208.5; 37.5 of 69.5 extra heads
    const advice = adviseHeldBack({ ...base, observed: 150, minutesIn: 20 });
    expect(advice.action).toBe("partial");
    expect(advice.projected).toBe(246);
    expect(advice.dishes[0].amount).toBeGreaterThan(0);
    expect(advice.dishes[0].amount).toBeLessThan(10.1);
  });

  test("waits when it is too early or too few have come", () => {
    expect(adviseHeldBack({ ...base, observed: 50, minutesIn: 2 }).action).toBe("wait");
    expect(adviseHeldBack({ ...base, observed: 4, minutesIn: 15 }).action).toBe("wait");
  });

  test("never suggests more than the held-back amount", () => {
    const advice = adviseHeldBack({ ...base, observed: 400, minutesIn: 20 });
    expect(advice.dishes[0].amount).toBe(10.1);
  });

  test("pieces are whole numbers", () => {
    const advice = adviseHeldBack({ ...base, observed: 150, minutesIn: 20 });
    expect(Number.isInteger(advice.dishes[1].amount)).toBe(true);
  });
});
