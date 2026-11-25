// Ridge regression (least squares with a small penalty), solved directly:
//   w = (X'X + lambda*I)^-1 X'y
// Small enough to explain by hand, which is why we didn't pull in an ML library.
// The first column of X is assumed to be the constant 1 and is not penalised.

function solve(A, b) {
  // Gaussian elimination with partial pivoting
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) throw new Error("Matrix is singular");

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function fitRidge(X, y, lambda = 1) {
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);

  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 1; a < k; a++) XtX[a][a] += lambda;

  return solve(XtX, Xty);
}

function predict(weights, x) {
  return weights.reduce((total, w, i) => total + w * x[i], 0);
}

module.exports = { fitRidge, predict, solve };
