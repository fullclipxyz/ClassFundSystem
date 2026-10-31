require("dotenv").config();
const db = require("./db");

async function fix() {
  console.log("Fixing Admin accounts...");
  await db.query("UPDATE users SET is_active = TRUE, is_default_password = FALSE, token_version = 1 WHERE role IN (1, 2)");
  console.log("✅ Admins fixed! You can delete this file now.");
  process.exit(0);
}
fix().catch(console.error);