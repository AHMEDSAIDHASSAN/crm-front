require('dotenv/config');
const { PrismaService } = require('./dist/config/prisma.service');

async function test() {
    console.log('Instantiating PrismaService...');
    try {
        const prisma = new PrismaService();
        console.log('PrismaService instantiated.');
        console.log('Connecting...');
        await prisma.onModuleInit();
        console.log('Connected successfully (script).');
        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
