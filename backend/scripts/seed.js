// Seeds demo accounts and the dish list.
// Every demo account uses the password "messmind123".
require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../src/db/pool");

const STUDENT_COUNT = 400;

const firstNames = [
  "Aarav", "Vivaan", "Aditya", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Rohan", "Kabir",
  "Ananya", "Diya", "Saanvi", "Aadhya", "Pari", "Myra", "Riya", "Kavya", "Sneha", "Isha",
  "Rahul", "Harsh", "Yash", "Nikhil", "Pranav", "Tanvi", "Shreya", "Neha", "Aman", "Kunal",
];
const lastNames = [
  "Sharma", "Verma", "Gupta", "Singh", "Yadav", "Patel", "Mishra", "Joshi", "Kulkarni", "Deshmukh",
  "Reddy", "Nair", "Iyer", "Chauhan", "Tiwari", "Pandey", "Saxena", "Agarwal", "Jain", "Mehta",
];

// per-head consumption rates, same units as the kitchen uses
const dishes = [
  { name: "Rice", unit: "kg", rate: 0.145 },
  { name: "Dal", unit: "L", rate: 0.21 },
  { name: "Roti", unit: "pcs", rate: 3.5 },
  { name: "Mixed Veg", unit: "kg", rate: 0.12 },
  { name: "Paneer Curry", unit: "kg", rate: 0.11 },
  { name: "Poha", unit: "kg", rate: 0.13 },
  { name: "Tea", unit: "L", rate: 0.15 },
  { name: "Bread", unit: "pcs", rate: 3 },
];

function rollNumber(i) {
  const branch = i % 3 === 0 ? "LCB" : "LCI";
  // start at 101 so demo rolls never clash with real ones
  return `${branch}2025${String(i + 101).padStart(3, "0")}`;
}

async function main() {
  const hash = await bcrypt.hash("messmind123", 10);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES
      ('Mess Manager', 'admin@iiitl.ac.in', $1, 'admin'),
      ('Ramesh Kumar', 'staff1@iiitl.ac.in', $1, 'staff'),
      ('Suresh Prasad', 'staff2@iiitl.ac.in', $1, 'staff')`,
    [hash]
  );

  for (let i = 0; i < STUDENT_COUNT; i++) {
    const name = `${firstNames[i % firstNames.length]} ${lastNames[(i * 7) % lastNames.length]}`;
    const email = `${rollNumber(i).toLowerCase()}@iiitl.ac.in`;
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'student') RETURNING user_id`,
      [name, email, hash]
    );
    await pool.query("INSERT INTO reliability_profiles (user_id) VALUES ($1)", [rows[0].user_id]);
  }

  for (const d of dishes) {
    await pool.query(
      "INSERT INTO dishes (name, unit, consumption_rate) VALUES ($1, $2, $3)",
      [d.name, d.unit, d.rate]
    );
  }

  console.log(`Seeded 1 admin, 2 staff, ${STUDENT_COUNT} students and ${dishes.length} dishes`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
