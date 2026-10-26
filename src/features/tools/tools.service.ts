import { Injectable, Inject } from '@nestjs/common';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DocumentsService } from '../documents/documents.service';
import { RagService } from '../rag/rag.service';
import { CHAT_MODEL } from '../../ai/llm-provider.module';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

@Injectable()
export class ToolsService {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly ragService: RagService,
    @Inject(CHAT_MODEL) private readonly chatModel: BaseChatModel,
  ) {}

  /**
   * Return the list of custom tools available to the LangChain Agent.
   * Uses DynamicStructuredTool with bulletproof Zod schemas to prevent 400 validation failures.
   */
  getTools(scopedDocumentId?: string, customChatModel?: BaseChatModel): DynamicStructuredTool[] {
    const activeModel = customChatModel || this.chatModel;

    return [
      new DynamicStructuredTool({
        name: 'list_all_documents',
        description: 'List all uploaded documents in the database. Returns document id, title, and filename.',
        schema: z.object({
          confirm: z
            .boolean()
            .describe('Set to true to confirm listing all files'),
        }),
        func: async () => {
          try {
            const docs = await this.documentsService.findAll();
            if (docs.length === 0) {
              return 'No documents uploaded yet. Ask the user to upload files first.';
            }
            return JSON.stringify(
              docs.map((d) => ({
                id: d.id,
                title: d.title,
                filename: d.filename,
                uploadDate: d.uploadDate,
                fileSize: d.fileSize,
              })),
              null,
              2
            );
          } catch (e) {
            return `Failed to list documents: ${e.message}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'search_documents',
        description: scopedDocumentId
          ? `Search for relevant text snippets specifically inside the focused document (${scopedDocumentId}).`
          : 'Search inside uploaded documents for relevant text snippets using semantic vector search. Essential for answering questions.',
        schema: z.object({
          query: z
            .string()
            .describe('The search query or keyword phrase used to match document chunks'),
        }),
        func: async ({ query }) => {
          try {
            const cleanQuery = query ? query.replace(/["'{}]/g, '').trim() : '';
            if (cleanQuery.length === 0) {
              return 'Please provide a valid search query string.';
            }
            const results = await this.ragService.searchSimilarity(cleanQuery, 4, 0.2, scopedDocumentId);
            if (results.length === 0) {
              return 'No matching contents found inside the documents for this search query.';
            }
            return JSON.stringify(
              results.map((r) => ({
                documentTitle: r.documentTitle,
                excerpt: r.content,
                similarity: (r.similarity * 100).toFixed(1) + '%',
              })),
              null,
              2
            );
          } catch (e) {
            return `Search failed: ${e.message}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'get_document_content',
        description: 'Retrieve the complete raw text content of a specific document.',
        schema: z.object({
          documentId: z
            .string()
            .describe('The unique UUID string of the document to retrieve'),
        }),
        func: async ({ documentId }) => {
          try {
            const cleanId = (scopedDocumentId || documentId || '').trim().replace(/["'{}]/g, '');
            const doc = await this.documentsService.findOne(cleanId);
            if (!doc.chunks || doc.chunks.length === 0) {
              return 'This document has no content chunks in database.';
            }
            const sortedChunks = [...doc.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
            return sortedChunks.map((c) => c.content).join('\n\n');
          } catch (e) {
            return `Failed to get document content: ${e.message}`;
          }
        },
      }),

      new DynamicStructuredTool({
        name: 'summarize_document',
        description: 'Generate a short summary of a specific document.',
        schema: z.object({
          documentId: z
            .string()
            .describe('The unique UUID string of the document to summarize'),
        }),
        func: async ({ documentId }) => {
          try {
            const cleanId = (scopedDocumentId || documentId || '').trim().replace(/["'{}]/g, '');
            const doc = await this.documentsService.findOne(cleanId);
            if (!doc.chunks || doc.chunks.length === 0) {
              return 'This document has no content chunks in database.';
            }
            const sortedChunks = [...doc.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
            const fullContent = sortedChunks.map((c) => c.content).join('\n\n');
            const truncatedText = fullContent.substring(0, 8000); // Truncate to prevent context overflow

            const response = await activeModel.invoke([
              {
                role: 'system',
                content: 'You are a professional summarizer. Write a concise, bulleted summary of the following document content.',
              },
              {
                role: 'user',
                content: `Document Title: ${doc.title}\n\nContent:\n${truncatedText}`,
              },
            ]);

            return typeof response.content === 'string'
              ? response.content
              : JSON.stringify(response.content);
          } catch (e) {
            return `Failed to generate summary: ${e.message}`;
          }
        },
      }),
    ];
  }
}
