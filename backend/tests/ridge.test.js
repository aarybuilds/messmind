const { fitRidge, predict, solve } = require("../src/services/ridge");

test("solves a small linear system", () => {
  // 2x + y = 5, x - y = 1  ->  x = 2, y = 1
  const [x, y] = solve([[2, 1], [1, -1]], [5, 1]);
  expect(x).toBeCloseTo(2, 10);
  expect(y).toBeCloseTo(1, 10);
});

test("recovers a known line when there is no penalty", () => {
  // y = 3 + 2a - b
  const X = [];
  const y = [];
  for (let a = 0; a < 5; a++) {
    for (let b = 0; b < 5; b++) {
      X.push([1, a, b]);
      y.push(3 + 2 * a - b);
    }
  }
  const w = fitRidge(X, y, 0);
  expect(w[0]).toBeCloseTo(3, 6);
  expect(w[1]).toBeCloseTo(2, 6);
  expect(w[2]).toBeCloseTo(-1, 6);
  expect(predict(w, [1, 10, 4])).toBeCloseTo(19, 6);
});

test("the penalty shrinks weights but not the intercept", () => {
  const X = [[1, 1], [1, 2], [1, 3], [1, 4]];
  const y = [2, 4, 6, 8];
  const plain = fitRidge(X, y, 0);
  const ridge = fitRidge(X, y, 10);
  expect(Math.abs(ridge[1])).toBeLessThan(Math.abs(plain[1]));
});

test("a column that never changes does not break it", () => {
  const X = [[1, 0, 5], [1, 0, 6], [1, 0, 7]];
  expect(() => fitRidge(X, [5, 6, 7], 1)).not.toThrow();
});
