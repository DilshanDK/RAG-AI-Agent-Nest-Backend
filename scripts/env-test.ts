import { PrismaClient } from '@prisma/client';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables from the root folder
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runTests() {
  console.log('=========================================');
  console.log('🔍 STARTING SYSTEM CONNECTION DIAGNOSTICS');
  console.log('=========================================\n');

  // 1. Test Neon PostgreSQL via Prisma
  console.log('1. Testing Neon PostgreSQL Connection...');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    await prisma.$connect();
    const dbResult = await prisma.$queryRaw<[{ result: number }]>`SELECT 1 as result`;
    console.log(`✅ Database Connection: SUCCESS (Query returned ${dbResult[0].result})\n`);
  } catch (error) {
    console.error('❌ Database Connection: FAILED');
    console.error(error);
    console.log();
  } finally {
    await prisma.$disconnect();
  }

  // 2. Test Google Gemini API
  console.log('2. Testing Google Gemini API...');
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️ GEMINI_API_KEY not found in env.\n');
  } else {
    try {
      const gemini = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        modelName: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        maxRetries: 1,
      });
      const response = await gemini.invoke([
        { role: 'user', content: 'Say "Gemini API Connection: SUCCESS!" in a single line.' },
      ]);
      console.log(`✅ Gemini Response: "${response.content.toString().trim()}"\n`);
    } catch (error: any) {
      console.error('❌ Gemini API Connection: FAILED');
      console.error(error?.message || error);
      console.log();
    }
  }

  // 3. Test Groq API
  console.log('3. Testing Groq API...');
  if (!process.env.GROQ_API_KEY) {
    console.log('⚠️ GROQ_API_KEY not found in env.\n');
  } else {
    try {
      const groq = new ChatOpenAI({
        apiKey: process.env.GROQ_API_KEY,
        modelName: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        configuration: {
          baseURL: 'https://api.groq.com/openai/v1',
        },
        maxRetries: 1,
      });
      const response = await groq.invoke([
        { role: 'user', content: 'Say "Groq API Connection: SUCCESS!" in a single line.' },
      ]);
      console.log(`✅ Groq Response: "${response.content.toString().trim()}"\n`);
    } catch (error: any) {
      console.error('❌ Groq API Connection: FAILED');
      console.error(error?.message || error);
      console.log();
    }
  }

  // 4. Test OpenRouter API
  console.log('4. Testing OpenRouter API...');
  if (!process.env.OPENROUTER_API_KEY) {
    console.log('⚠️ OPENROUTER_API_KEY not found in env.\n');
  } else {
    try {
      const openRouter = new ChatOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        modelName: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        maxRetries: 1,
      });
      const response = await openRouter.invoke([
        { role: 'user', content: 'Say "OpenRouter API Connection: SUCCESS!" in a single line.' },
      ]);
      console.log(`✅ OpenRouter Response: "${response.content.toString().trim()}"\n`);
    } catch (error: any) {
      console.error('❌ OpenRouter API Connection: FAILED');
      console.error(error?.message || error);
      console.log();
    }
  }

  console.log('=========================================');
  console.log('🏁 DIAGNOSTICS COMPLETED');
  console.log('=========================================');
}

runTests().catch((err) => {
  console.error('Fatal execution error:', err);
});
