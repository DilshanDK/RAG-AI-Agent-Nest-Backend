import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import { CHAT_MODEL } from '../../ai/llm-provider.module';
import { LlmProviderService } from '../../ai/llm-provider.service';
import { Prisma } from '@prisma/client';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';

export interface ChatResponse {
  answer: string;
  sources: Array<{
    documentId: string;
    documentTitle: string;
    filename: string;
    chunkIndex: number;
    similarity: number;
    excerpt: string;
  }>;
  userId: string;
  messageId: string;
  sessionId?: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly llmProviderService: LlmProviderService,
    @Inject(CHAT_MODEL) private readonly defaultChatModel: BaseChatModel,
  ) {}

  /**
   * Ensure a default system user exists (for anonymous chat sessions).
   */
  private async getOrCreateDefaultUser(): Promise<string> {
    const defaultEmail = 'system@rag-agent.local';
    let user = await this.prisma.user.findUnique({
      where: { email: defaultEmail },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email: defaultEmail, passwordHash: 'system_default_hash' },
      });
    }
    return user.id;
  }

  /**
   * Helper to ensure the given userId exists in the database.
   * If the user doesn't exist, we dynamically create them (supporting guest/local storage sessions).
   */
  async ensureUserExists(userId: string): Promise<string> {
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

  // ── Session Management ─────────────────────────────────────────────

  async createSession(userId: string, title?: string, documentId?: string, provider?: string) {
    const effectiveUserId = await this.ensureUserExists(userId);
    return this.prisma.chatSession.create({
      data: {
        userId: effectiveUserId,
        title: title || 'New Chat',
        documentId: documentId || null,
        provider: provider || this.llmProviderService.getDefaultProvider(),
      },
    });
  }

  async getSessions(userId: string) {
    const effectiveUserId = await this.ensureUserExists(userId);
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId: effectiveUserId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      userId: s.userId,
      documentId: s.documentId,
      provider: s.provider || this.llmProviderService.getDefaultProvider(),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s._count.messages,
    }));
  }

  async updateSession(sessionId: string, data: { title?: string; documentId?: string; provider?: string }) {
    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.documentId !== undefined ? { documentId: data.documentId || null } : {}),
        ...(data.provider !== undefined ? { provider: data.provider || null } : {}),
      },
    });
  }

  async deleteSession(sessionId: string) {
    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });
    return { success: true };
  }

  // ── Core RAG Chat Loop ─────────────────────────────────────────────

  async chat(
    userMessage: string,
    userId?: string,
    sessionId?: string,
    documentId?: string,
    provider?: string,
  ): Promise<ChatResponse> {
    const effectiveUserId = userId 
      ? await this.ensureUserExists(userId) 
      : await this.getOrCreateDefaultUser();

    let session: any = null;
    if (sessionId) {
      session = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        session = await this.prisma.chatSession.create({
          data: {
            id: sessionId,
            userId: effectiveUserId,
            title: userMessage.substring(0, 35).trim() || 'New Chat',
            documentId: documentId || null,
            provider: provider || this.llmProviderService.getDefaultProvider(),
          },
        });
      } else {
        if (session.title === 'New Chat') {
          await this.prisma.chatSession.update({
            where: { id: session.id },
            data: { title: userMessage.substring(0, 35).trim() },
          });
        }
      }
    }

    const effectiveDocumentId = documentId || session?.documentId || undefined;
    const effectiveProvider = session?.provider || provider || this.llmProviderService.getDefaultProvider();

    this.logger.log(
      `[Chat] User: "${userMessage.substring(0, 50)}..." | Session: ${session?.id || 'none'} | DocScope: ${effectiveDocumentId || 'all'} | Provider: ${effectiveProvider}`
    );

    // ── Step 1: Semantic vector search ──────────────────────────────
    const relevantChunks = await this.ragService.searchSimilarity(
      userMessage,
      5,
      0.2,
      effectiveDocumentId,
    );

    // ── Step 2: Build grounded system prompt ─────────────────────────
    let systemPrompt: string;
    if (relevantChunks.length > 0) {
      const contextBlock = relevantChunks
        .map(
          (chunk, i) =>
            `[Source ${i + 1}] "${chunk.documentTitle}" (chunk ${chunk.chunkIndex}):\n${chunk.content}`,
        )
        .join('\n\n---\n\n');

      systemPrompt = `You are a helpful and knowledgeable AI assistant.
Answer the user's question using ONLY the retrieved document context below.
${effectiveDocumentId ? `You are strictly focused on answering questions from the targeted document.` : ''}

RETRIEVED CONTEXT:
${contextBlock}

INSTRUCTIONS:
- Answer based strictly on the context provided above.
- Be concise, accurate, and cite which source you used (e.g., "According to Source 1...").
- Do not hallucinate or add information not present in the context.`;
    } else {
      systemPrompt = `You are a helpful AI assistant. 
No relevant document passages were found in the knowledge base matching this question.
Inform the user that no matching text was found in their uploaded files.`;
    }

    // ── Step 3: Retrieve recent conversation history ────────────────
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: {
        userId: effectiveUserId,
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: 6,
    });

    const historyMessages = recentMessages.reverse().map((msg) =>
      msg.role === 'user'
        ? new HumanMessage(msg.message)
        : new AIMessage(msg.message),
    );

    // ── Step 4: Invoke Active LLM ───────────────────────────────────
    const activeModel = this.llmProviderService.getChatModel(effectiveProvider);

    const messages = [
      new SystemMessage(systemPrompt),
      ...historyMessages,
      new HumanMessage(userMessage),
    ];

    const llmResponse = await activeModel.invoke(messages);
    const assistantAnswer =
      typeof llmResponse.content === 'string'
        ? llmResponse.content
        : JSON.stringify(llmResponse.content);

    // ── Step 5: Persist to database ──────────────────────────────────
    const sources = relevantChunks.map((chunk) => ({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      filename: chunk.filename,
      chunkIndex: chunk.chunkIndex,
      similarity: Number((chunk.similarity * 100).toFixed(1)),
      excerpt: chunk.content.substring(0, 200) + '...',
    }));

    await this.prisma.chatMessage.create({
      data: {
        userId: effectiveUserId,
        sessionId: session ? session.id : null,
        role: 'user',
        message: userMessage,
        sources: Prisma.DbNull,
      },
    });

    const savedAssistantMsg = await this.prisma.chatMessage.create({
      data: {
        userId: effectiveUserId,
        sessionId: session ? session.id : null,
        role: 'assistant',
        message: assistantAnswer,
        sources: sources.length > 0 ? (sources as any) : Prisma.DbNull,
      },
    });

    if (session) {
      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date() },
      });
    }

    return {
      answer: assistantAnswer,
      sources,
      userId: effectiveUserId,
      messageId: savedAssistantMsg.id,
      sessionId: session?.id,
    };
  }

  /**
   * Retrieve conversation history for a user, optionally filtered by sessionId.
   */
  async getHistory(userId: string, limit = 50, sessionId?: string) {
    return this.prisma.chatMessage.findMany({
      where: {
        userId,
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Clear chat messages for a user or session.
   */
  async clearHistory(userId: string, sessionId?: string) {
    const deleted = await this.prisma.chatMessage.deleteMany({
      where: {
        userId,
        ...(sessionId ? { sessionId } : {}),
      },
    });
    return {
      message: `Cleared ${deleted.count} message(s)`,
    };
  }
}
