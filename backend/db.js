require("dotenv").config();
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  // Aiven requires SSL. We set rejectUnauthorized to false 
  // so you don't have to manually download their CA certificate.
  ssl: {
    rejectUnauthorized: false
  },
  // Prevents the database from crashing if too many students log in at once
  connectionLimit: 10, 
  waitForConnections: true,
});

module.exports = pool;