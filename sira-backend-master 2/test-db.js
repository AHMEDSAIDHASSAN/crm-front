const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    const url = process.env.DATABASE_URL;
    console.log('Testing connection to:', url);
    try {
        const connection = await mysql.createConnection(url);
        console.log('Successfully connected to the database!');
        await connection.end();
    } catch (error) {
        console.error('Failed to connect to the database:', error.message);
    }
}

testConnection();
