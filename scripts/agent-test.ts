import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AgentService } from '../src/features/agent/agent.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DocumentsService } from '../src/features/documents/documents.service';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runAgentDiagnostic() {
  console.log('=========================================');
  console.log('🧪 TESTING PHASE 5: AI AGENT & DYNAMIC TOOLS');
  console.log('=========================================\n');

  // 1. Initialize NestJS App Context (lightweight container bootstrap)
  console.log('1. Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const agentService = app.get(AgentService);
  const prisma = app.get(PrismaService);
  const documentsService = app.get(DocumentsService);
  
  console.log('✅ NestJS App Context: Ready.\n');

  let testDocId: string | null = null;
  let sampleFilePath = '';

  try {
    // 2. Ensure default user exists
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
      console.log(`2. Default User: Active (${user.id}).\n`);
    }

    // 3. Create a temporary knowledge file on disk
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    sampleFilePath = path.join(uploadsDir, 'agent_secret_knowledge.txt');
    const secretContent = `
    RAG AI Agent Secret Fact Code Name: Red Panda.
    Project Supercomputer Location: Secret Facility inside the Swiss Alps.
    Project Supercomputer Power Supply: Powered entirely by a dedicated hydro-electric mountain generator.
    Cryogenic Computing Note: Qubits must remain supercooled under 10 millikelvins.
    `;
    fs.writeFileSync(sampleFilePath, secretContent.trim(), 'utf8');
    console.log(`3. Local Disk: Created test file at ${sampleFilePath}\n`);

    // 4. Register & Ingest Document (triggers automatic text parsing, chunking, embeddings, pgvector storage)
    console.log('4. Registering and Auto-Ingesting document in RAG Vector Store...');
    const fakeFile = {
      fieldname: 'file',
      originalname: 'agent_secret_knowledge.txt',
      encoding: '7bit',
      mimetype: 'text/plain',
      filename: 'agent_secret_knowledge.txt',
      path: sampleFilePath,
      size: fs.statSync(sampleFilePath).size,
      stream: null as any,
      destination: uploadsDir,
      buffer: null as any,
    } as Express.Multer.File;

    const documentRecord = await documentsService.createDocument(
      fakeFile,
      'Agent Secret Knowledge Base',
      user.id
    );
    testDocId = documentRecord.id;
    console.log(`✅ Ingested: ID "${testDocId}" (${documentRecord.chunksIngested} chunks created).\n`);

    // 5. Test Tool Use Case: List All Documents
    console.log('5. Querying Agent to list active files (should trigger "list_all_documents" tool)...');
    const listResponse = await agentService.runAgent(
      'Can you list all the documents currently uploaded in the system?',
      user.id
    );
    console.log('🤖 Agent Final Response:');
    console.log(`"${listResponse.answer}"\n`);

    // 6. Test Tool Use Case: Search & Summarize (Semantic RAG)
    console.log('6. Querying Agent on specific content (should trigger "search_documents" and "summarize_document" tools)...');
    const queryResponse = await agentService.runAgent(
      'Where is the Project Supercomputer located and what is its secret code name?',
      user.id
    );
    console.log('🤖 Agent Final Response:');
    console.log(`"${queryResponse.answer}"`);
    console.log('\n🔍 Referenced Citations inside ChatMessage:');
    console.log(JSON.stringify(queryResponse.sources, null, 2));
    console.log();

  } catch (error) {
    console.error('❌ Agent Diagnostics Test Failed:');
    console.error(error);
  } finally {
    // 7. Cleanup
    if (testDocId) {
      console.log('7. Cleaning up test database records and local files...');
      await documentsService.remove(testDocId);
      console.log('✅ Cleanup finished.\n');
    }
    
    // Shut down Nest container
    await app.close();
    console.log('=========================================');
    console.log('🏁 DIAGNOSTICS COMPLETED');
    console.log('=========================================');
  }
}

runAgentDiagnostic();
