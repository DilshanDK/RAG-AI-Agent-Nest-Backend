import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from '../../ai/embeddings/embeddings.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfParse from 'pdf-parse';

export interface SearchResultChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  filename: string;
  content: string;
  chunkIndex: number;
  similarity: number;
}

@Injectable()
export class RagService {
  private readonly textSplitter: RecursiveCharacterTextSplitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  }

  /**
   * Extract raw text from file (.txt, .md, .pdf)
   */
  async extractTextFromFile(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File not found at path: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const parsePdf: any = (pdfParse as any).default || pdfParse;
      const pdfData = await parsePdf(dataBuffer);
      return pdfData.text || '';
    } else if (ext === '.txt' || ext === '.md') {
      return fs.readFileSync(filePath, 'utf-8');
    } else {
      throw new InternalServerErrorException(`Unsupported file extension for parsing: ${ext}`);
    }
  }

  /**
   * Ingest document by ID: Extract text -> Split into chunks -> Compute Embeddings -> Save to pgvector
   */
  async ingestDocument(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID "${documentId}" not found`);
    }

    // 1. Extract raw text from file
    const rawText = await this.extractTextFromFile(document.filePath);
    if (!rawText || rawText.trim().length === 0) {
      throw new InternalServerErrorException(`No text could be extracted from document "${document.title}"`);
    }

    // 2. Partition text into chunks
    const chunkTexts = await this.textSplitter.splitText(rawText);
    if (chunkTexts.length === 0) {
      return { documentId, chunksIngested: 0, message: 'Document had no text content.' };
    }

    // 3. Clear existing chunks for this document if re-ingesting
    await this.prisma.documentChunk.deleteMany({
      where: { documentId },
    });

    // 4. Batch compute vector embeddings
    const embeddings = await this.embeddingsService.embedDocuments(chunkTexts);

    // 5. Store chunks & pgvector embeddings in Neon PostgreSQL
    for (let i = 0; i < chunkTexts.length; i++) {
      const content = chunkTexts[i];
      const vector = JSON.stringify(embeddings[i]);
      const chunkId = `${documentId}_chunk_${i}`;

      await this.prisma.$executeRaw`
        INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding", "chunkIndex")
        VALUES (${chunkId}, ${documentId}, ${content}, ${vector}::vector, ${i})
      `;
    }

    return {
      documentId,
      documentTitle: document.title,
      chunksIngested: chunkTexts.length,
      status: 'SUCCESS',
    };
  }

  /**
   * Semantic Vector Search using pgvector cosine distance operator (<=>)
   */
  async searchSimilarity(
    query: string,
    topK = 4,
    minScore = 0.2,
    documentId?: string,
  ): Promise<SearchResultChunk[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // 1. Embed user query string
    const queryVector = await this.embeddingsService.embedQuery(query);
    const vectorString = JSON.stringify(queryVector);

    // 2. Query pgvector using raw SQL for cosine distance, optionally scoped to a documentId
    let rawResults: Array<{
      id: string;
      documentId: string;
      content: string;
      chunkIndex: number;
      similarity: number;
      title: string;
      filename: string;
    }>;

    if (documentId && documentId.trim().length > 0) {
      rawResults = await this.prisma.$queryRaw`
        SELECT 
          dc."id", 
          dc."documentId", 
          dc."content", 
          dc."chunkIndex", 
          (1 - (dc."embedding" <=> ${vectorString}::vector)) as similarity,
          d."title",
          d."filename"
        FROM "DocumentChunk" dc
        JOIN "Document" d ON dc."documentId" = d."id"
        WHERE dc."documentId" = ${documentId.trim()}
          AND (1 - (dc."embedding" <=> ${vectorString}::vector)) >= ${minScore}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `;
    } else {
      rawResults = await this.prisma.$queryRaw`
        SELECT 
          dc."id", 
          dc."documentId", 
          dc."content", 
          dc."chunkIndex", 
          (1 - (dc."embedding" <=> ${vectorString}::vector)) as similarity,
          d."title",
          d."filename"
        FROM "DocumentChunk" dc
        JOIN "Document" d ON dc."documentId" = d."id"
        WHERE (1 - (dc."embedding" <=> ${vectorString}::vector)) >= ${minScore}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `;
    }

    return rawResults.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      documentTitle: row.title,
      filename: row.filename,
      content: row.content,
      chunkIndex: Number(row.chunkIndex),
      similarity: Number(row.similarity),
    }));
  }
}
