require("dotenv").config();
const mysql = require("mysql2/promise");

let ssl;
if (process.env.DB_CA_CERT) {
  ssl = { ca: process.env.DB_CA_CERT.replace(/\\n/g, "\n"), rejectUnauthorized: true };
} else {
  console.warn("WARNING: DB_CA_CERT is not set. The database TLS certificate is NOT being verified.");
  ssl = { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  ssl,
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 50,
  connectTimeout: 10000,
});

module.exports = pool;