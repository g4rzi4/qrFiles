const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'qruser',
  password: process.env.DB_PASSWORD || 'qrpassword',
  database: process.env.DB_NAME || 'qrfiles_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00'
});

module.exports = pool;
