const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const mealMarkRoutes = require("./routes/mealMarks");
const predictionRoutes = require("./routes/predictions");
const staffRoutes = require("./routes/staff");
const adminRoutes = require("./routes/admin");

const app = express();

// CLIENT_URL can list several origins separated by commas (e.g. the Vercel URL and localhost)
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((o) => o.trim());
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/meal-marks", mealMarkRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong" });
});

module.exports = app;
