const mysql = require('mysql2/promise');

const passwords = ['', 'root', 'mysql', 'admin', '123456', '12345678', 'admin123', 'root123', '1234', 'password'];
const hosts = ['127.0.0.1', 'localhost'];

async function run() {
    for (const host of hosts) {
        for (const password of passwords) {
            console.log(`Testing root:${password}@${host}...`);
            try {
                const connection = await mysql.createConnection({ host, user: 'root', password });
                console.log(`SUCCESS! Host: ${host}, Password: ${password}`);
                await connection.end();
                process.exit(0);
            } catch (e) {
                // console.log(`FAILED: ${e.message}`);
            }
        }
    }
    console.log('All attempts failed.');
}

run();
