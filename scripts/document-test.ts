import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function testDocumentOperations() {
  console.log('=========================================');
  console.log('🧪 TESTING PHASE 2: DOCUMENT & DATABASE OPERATIONS');
  console.log('=========================================\n');

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log('1. DB Connection: Connected to Neon PostgreSQL successfully.\n');

    // Ensure default system user exists
    const defaultEmail = 'system@rag-agent.local';
    let user = await prisma.user.findUnique({ where: { email: defaultEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: defaultEmail,
          passwordHash: 'system_test_hash',
        },
      });
      console.log(`2. Default User: Created system test user (${user.id}).\n`);
    } else {
      console.log(`2. Default User: Found existing system test user (${user.id}).\n`);
    }

    // Create dummy sample file in /uploads
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const testFilePath = path.join(uploadsDir, 'sample_test_doc.txt');
    fs.writeFileSync(testFilePath, 'This is a sample document for testing RAG AI Agent ingestion.');
    console.log(`3. Local Disk: Created test file at ${testFilePath}\n`);

    // Insert Document Record
    const document = await prisma.document.create({
      data: {
        title: 'Sample Test Document',
        filename: 'sample_test_doc.txt',
        filePath: testFilePath,
        fileSize: fs.statSync(testFilePath).size,
        userId: user.id,
      },
    });
    console.log(`4. DB Create Document: SUCCESS (Document ID: ${document.id})\n`);

    // Read Document Records
    const documentsList = await prisma.document.findMany({
      orderBy: { uploadDate: 'desc' },
    });
    console.log(`5. DB List Documents: Found ${documentsList.length} total document(s).\n`);

    // Clean up test document
    await prisma.document.delete({ where: { id: document.id } });
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    console.log(`6. DB Delete & File Cleanup: SUCCESS (Document ID: ${document.id} deleted).\n`);

    console.log('=========================================');
    console.log('✅ ALL PHASE 2 TESTS PASSED CLEANLY!');
    console.log('=========================================');
  } catch (error) {
    console.error('❌ Document Operations Test Failed:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testDocumentOperations();
