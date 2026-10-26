import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import * as fs from 'fs';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  /**
   * Helper to ensure a default user exists if no userId is provided.
   */
  private async getOrCreateDefaultUser(): Promise<string> {
    const defaultEmail = 'system@rag-agent.local';
    let user = await this.prisma.user.findUnique({
      where: { email: defaultEmail },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: defaultEmail,
          passwordHash: 'system_default_hash',
        },
      });
    }

    return user.id;
  }

  /**
   * Helper to ensure the given userId exists in the database.
   * If the user doesn't exist, we dynamically create them (supporting guest/local storage sessions).
   */
  private async ensureUserExists(userId: string): Promise<string> {
    let user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@rag-agent.local`,
          passwordHash: 'guest_session_hash',
        },
      });
      this.logger.log(`Created guest user record in DB for ID: ${userId}`);
    }

    return user.id;
  }

  /**
   * Create document metadata record in DB after file upload, then automatically trigger RAG ingestion.
   */
  async createDocument(file: Express.Multer.File, customTitle?: string, userId?: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const effectiveUserId = userId 
      ? await this.ensureUserExists(userId) 
      : await this.getOrCreateDefaultUser();
    const title = customTitle || file.originalname;

    const document = await this.prisma.document.create({
      data: {
        title,
        filename: file.filename,
        filePath: file.path,
        fileSize: file.size,
        userId: effectiveUserId,
      },
    });

    // Automatically trigger RAG ingestion (text extraction, chunking, Gemini embedding generation, pgvector storage)
    try {
      const ingestionResult = await this.ragService.ingestDocument(document.id);
      this.logger.log(`Auto-ingested document "${document.title}" (${ingestionResult.chunksIngested} chunks created).`);
      return {
        ...document,
        chunksIngested: ingestionResult.chunksIngested,
      };
    } catch (error) {
      this.logger.error(`Failed auto-ingesting document "${document.title}": ${error.message}`);
      return {
        ...document,
        chunksIngested: 0,
        ingestionError: error.message,
      };
    }
  }

  /**
   * List all documents in the system.
   */
  async findAll() {
    return this.prisma.document.findMany({
      orderBy: { uploadDate: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  }

  /**
   * Get a single document record by ID.
   */
  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          select: {
            id: true,
            chunkIndex: true,
            content: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID "${id}" not found`);
    }

    return document;
  }

  /**
   * Delete a document, its database records (including chunks via cascade),
   * and its physical file on disk.
   */
  async remove(id: string) {
    const document = await this.findOne(id);

    // Delete record from PostgreSQL (chunks are deleted via CASCADE)
    await this.prisma.document.delete({
      where: { id },
    });

    // Delete physical file from disk if it exists
    if (fs.existsSync(document.filePath)) {
      try {
        fs.unlinkSync(document.filePath);
      } catch (err) {
        this.logger.warn(`Failed to delete physical file at ${document.filePath}: ${err.message}`);
      }
    }

    return {
      message: `Document "${document.title}" (ID: ${id}) deleted successfully`,
    };
  }
}
