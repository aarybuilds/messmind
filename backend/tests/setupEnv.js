// Tests use their own database so they never touch demo data
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgres://localhost:5432/messmind_test";
process.env.JWT_SECRET = "test-secret";
