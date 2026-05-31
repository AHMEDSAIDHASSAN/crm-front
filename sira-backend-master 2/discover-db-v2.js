const mysql = require('mysql2/promise');

const configs = [
    { host: '127.0.0.1', user: 'mohamed', password: '' },
    { host: '127.0.0.1', user: 'mohamed', password: '123' },
    { host: '127.0.0.1', user: 'mohamed', password: 'root' },
    { host: '127.0.0.1', user: 'mohamed', password: 'password' },
    { host: '127.0.0.1', user: 'admin', password: '' },
    { host: '127.0.0.1', user: 'admin', password: 'admin' },
];

async function run() {
    for (const config of configs) {
        console.log(`Testing ${config.user}:${config.password}@${config.host}...`);
        try {
            const connection = await mysql.createConnection(config);
            console.log(`SUCCESS!`);
            await connection.end();
            process.exit(0);
        } catch (e) {
            console.log(`FAILED: ${e.message}`);
        }
    }
    console.log('All attempts failed.');
}

run();
