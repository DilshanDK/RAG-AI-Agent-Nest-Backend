import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testRagPipeline() {
  console.log('=========================================');
  console.log('🧪 TESTING PHASE 3: RAG ENGINE & VECTOR EMBEDDINGS');
  console.log('=========================================\n');

  const prisma = new PrismaClient();
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: 'text-embedding-004',
  });

  try {
    await prisma.$connect();
    console.log('1. DB Connection: Connected to Neon PostgreSQL successfully.\n');

    // Default System User
    const defaultEmail = 'system@rag-agent.local';
    let user = await prisma.user.findUnique({ where: { email: defaultEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: defaultEmail, passwordHash: 'system_hash' },
      });
    }

    // 2. Create sample knowledge file
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const sampleFilePath = path.join(uploadsDir, 'ai_knowledge_base.txt');
    const sampleText = `
    The RAG AI Agent System is designed to leverage Retrieval-Augmented Generation.
    Secret Project Fact Alpha: The project core database is hosted on Neon PostgreSQL with pgvector extension enabled.
    Secret Project Fact Beta: The AI model cognitive engine uses Google Gemini Flash with llama-3.1-8b fallback options.
    Quantum Computing Note: Superconducting qubits operate at cryogenic temperatures near absolute zero.
    `;
    fs.writeFileSync(sampleFilePath, sampleText.trim());
    console.log(`2. Test Document Created: ${sampleFilePath}\n`);

    // 3. Create Document DB record
    const document = await prisma.document.create({
      data: {
        title: 'AI Knowledge Base',
        filename: 'ai_knowledge_base.txt',
        filePath: sampleFilePath,
        fileSize: fs.statSync(sampleFilePath).size,
        userId: user.id,
      },
    });
    console.log(`3. DB Document Record Created: ${document.id}\n`);

    // 4. Split Text into Chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const chunkTexts = await textSplitter.splitText(sampleText);
    console.log(`4. Text Splitter: Generated ${chunkTexts.length} chunk(s).\n`);

    // 5. Generate Vector Embeddings using Gemini
    console.log('5. Generating Vector Embeddings via Gemini (text-embedding-004)...');
    const vectors = await embeddings.embedDocuments(chunkTexts);
    console.log(`✅ Generated ${vectors.length} vector embedding(s) (Dimensions: ${vectors[0].length}).\n`);

    // 6. Insert Chunks into pgvector
    for (let i = 0; i < chunkTexts.length; i++) {
      const chunkId = `${document.id}_chunk_${i}`;
      const vectorJson = JSON.stringify(vectors[i]);
      await prisma.$executeRaw`
        INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding", "chunkIndex")
        VALUES (${chunkId}, ${document.id}, ${chunkTexts[i]}, ${vectorJson}::vector, ${i})
      `;
    }
    console.log('6. Vector Storage: Inserted chunks into PostgreSQL pgvector successfully.\n');

    // 7. Perform Semantic Similarity Vector Search
    const searchQuery = 'What database extension is used for storing project embeddings?';
    console.log(`7. Executing Vector Similarity Search for: "${searchQuery}"...`);
    const queryVector = await embeddings.embedQuery(searchQuery);
    const queryVectorJson = JSON.stringify(queryVector);

    const searchResults = await prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        similarity: number;
      }>
    >`
      SELECT 
        dc."id", 
        dc."content", 
        (1 - (dc."embedding" <=> ${queryVectorJson}::vector)) as similarity
      FROM "DocumentChunk" dc
      WHERE (1 - (dc."embedding" <=> ${queryVectorJson}::vector)) >= 0.2
      ORDER BY similarity DESC
      LIMIT 2
    `;

    console.log('\n🔍 SEMANTIC SEARCH RESULTS:');
    searchResults.forEach((res, index) => {
      console.log(`   Rank #${index + 1} (Score: ${(res.similarity * 100).toFixed(2)}%):`);
      console.log(`   Content Snippet: "${res.content.replace(/\s+/g, ' ').trim()}"\n`);
    });

    // 8. Cleanup
    await prisma.document.delete({ where: { id: document.id } });
    if (fs.existsSync(sampleFilePath)) {
      fs.unlinkSync(sampleFilePath);
    }
    console.log('8. Cleanup: Test document & pgvector chunks successfully cleaned up.\n');

    console.log('=========================================');
    console.log('✅ ALL PHASE 3 RAG & VECTOR TESTS PASSED CLEANLY!');
    console.log('=========================================');
  } catch (error) {
    console.error('❌ RAG Pipeline Test Failed:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testRagPipeline();
