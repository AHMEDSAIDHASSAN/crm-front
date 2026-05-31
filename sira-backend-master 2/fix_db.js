const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  try {
    // 1. Alter table to include both old and new enum values
    await prisma.$executeRawUnsafe(`ALTER TABLE leads MODIFY status ENUM('new','assigned','contacted','qualified','interested','not_interested','no_answer','converted','lost','rotation','another_meeting','new_lead','cold_call','follow_up','wrong_number','purchased') NOT NULL DEFAULT 'new_lead'`);
    console.log('Altered table to support both enums temporarily');
    
    // 2. Map old values to new values
    await prisma.$executeRawUnsafe(`UPDATE leads SET status = 'new_lead' WHERE status = 'new'`);
    await prisma.$executeRawUnsafe(`UPDATE leads SET status = 'purchased' WHERE status = 'converted'`);
    await prisma.$executeRawUnsafe(`UPDATE leads SET status = 'follow_up' WHERE status = 'contacted'`);
    await prisma.$executeRawUnsafe(`UPDATE leads SET status = 'not_interested' WHERE status = 'lost'`);
    await prisma.$executeRawUnsafe(`UPDATE leads SET status = 'new_lead' WHERE status = 'interested'`);
    await prisma.$executeRawUnsafe(`UPDATE leads SET status = 'new_lead' WHERE status = 'another_meeting'`);
    
    console.log('Mapped existing datatypes');
    
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
fix();
