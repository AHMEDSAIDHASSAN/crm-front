import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

async function main() {
    console.log('Testing connection with DATABASE_URL:', process.env.DATABASE_URL);

    const prisma = new PrismaClient({
        log: ['query', 'info', 'warn', 'error'],
    });

    try {
        console.log('Attempting to connect...');
        await prisma.$connect();
        console.log('\x1b[32m[Success] Database connected successfully!\x1b[0m');

        // Try a simple query
        const userCount = await prisma.user.count();
        console.log(`Current user count: ${userCount}`);

    } catch (e) {
        console.error('\x1b[31m[Failure] Connection failed:\x1b[0m');
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
