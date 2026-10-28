const bcrypt = require("bcryptjs");
const db = require("./db");

async function main() {
  const [studentId, name, password] = process.argv.slice(2);

  if (!studentId || !name || !password) {
    console.log("Usage: node createAdmin.js <id> <name> <password>");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  await db.query(
    "INSERT INTO users (student_id, name, password_hash, role) VALUES (?, ?, ?, 1)",
    [studentId, name, hash]
  );

  console.log("Admin created: " + name);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});