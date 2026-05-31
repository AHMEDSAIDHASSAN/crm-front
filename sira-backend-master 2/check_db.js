const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const result = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM leads LIKE "status"');
    console.log('Columns:', result);
    
    // Check if new_lead is in the enum
    if (result && result[0] && result[0].Type) {
       console.log('Enum definition:', result[0].Type);
    }
    
    // Also let's just forcefully alter the table to string temporarily or add the new enum values
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
check();
