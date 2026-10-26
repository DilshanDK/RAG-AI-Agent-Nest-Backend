import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function enableVectorExtension() {
  console.log('Connecting to Neon PostgreSQL to enable pgvector extension...');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    await prisma.$connect();
    console.log('Connected successfully. Executing CREATE EXTENSION...');
    
    // Enable pgvector
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ pgvector extension enabled successfully!');
  } catch (error) {
    console.error('❌ Failed to enable pgvector extension:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

enableVectorExtension();
