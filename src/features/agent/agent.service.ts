import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ToolsService } from '../tools/tools.service';
import { CHAT_MODEL } from '../../ai/llm-provider.module';
import { LlmProviderService } from '../../ai/llm-provider.service';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { Prisma } from '@prisma/client';

export interface AgentChatResponse {
  answer: string;
  sources: any[];
  userId: string;
  messageId: string;
  sessionId?: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolsService: ToolsService,
    private readonly llmProviderService: LlmProviderService,
    @Inject(CHAT_MODEL) private readonly defaultChatModel: BaseChatModel,
  ) {}

  /**
   * Helper to ensure a default system user exists.
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
   * Run the LangChain Tool-Calling Agent:
   * 1. Resolves active user, chat session, and focused document.
   * 2. Instantiates dynamic LLM model (Groq, Gemini, OpenRouter) based on session choice.
   * 3. Scopes tools to the focused document if requested.
   * 4. Binds tools and executes reasoning loop via AgentExecutor.
   * 5. Saves messages with sessionId and returns citations.
   */
  async runAgent(
    userMessage: string,
    userId?: string,
    sessionId?: string,
    documentId?: string,
    provider?: string,
  ): Promise<AgentChatResponse> {
    const effectiveUserId = userId 
      ? await this.ensureUserExists(userId) 
      : await this.getOrCreateDefaultUser();

    // ── Step 1: Manage Chat Session ──────────────────────────────────
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
        // Update documentId or provider if passed and currently unset
        const updateData: any = {};
        if (documentId && session.documentId !== documentId) {
          updateData.documentId = documentId;
        }
        if (provider && !session.provider) {
          updateData.provider = provider;
        }
        if (session.title === 'New Chat') {
          updateData.title = userMessage.substring(0, 35).trim();
        }
        if (Object.keys(updateData).length > 0) {
          session = await this.prisma.chatSession.update({
            where: { id: session.id },
            data: updateData,
          });
        }
      }
    }

    const effectiveDocumentId = documentId || session?.documentId || undefined;
    const effectiveProvider = session?.provider || provider || this.llmProviderService.getDefaultProvider();

    this.logger.log(
      `[Agent] User: "${userMessage.substring(0, 50)}..." | Session: ${session?.id || 'none'} | DocScope: ${effectiveDocumentId || 'all'} | Provider: ${effectiveProvider}`
    );

    // ── Step 2: Resolve LLM & Tools ──────────────────────────────────
    const activeModel = this.llmProviderService.getChatModel(effectiveProvider);
    const tools = this.toolsService.getTools(effectiveDocumentId, activeModel);

    // ── Step 3: Retrieve Recent Chat History for this Session ────────
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: {
        userId: effectiveUserId,
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: 8,
    });

    const chatHistory = recentMessages.reverse().map((msg) =>
      msg.role === 'user'
        ? new HumanMessage(msg.message)
        : new AIMessage(msg.message)
    );

    // ── Step 4: Define Prompt Template ──────────────────────────────
    let systemInstruction = `You are a premium, highly-capable AI Agent designed to help the user manage and query their knowledge base.
You have access to a set of custom tools to search, list, read, and summarize files uploaded by the user.

RULES OF ENGAGEMENT:
1. Always check what files are available using 'list_all_documents' or search contents using 'search_documents' if the query asks about document facts.
2. If you find a documentId, you can summarize or fetch its entire text using the appropriate tools.
3. Be transparent: explain which tools you are calling when retrieving information.
4. Ground your responses strictly on the contents returned by your tools. Do not hallucinate or construct answers.
5. If the tools return no information, politely inform the user that you couldn't find matching information inside their files.`;

    if (effectiveDocumentId) {
      systemInstruction += `\n\nIMPORTANT FOCUS: The user is studying/asking specifically about document with ID "${effectiveDocumentId}". Prioritize searching and answering using the contents of this specific file.`;
    }

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemInstruction],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // ── Step 5: Construct and Execute Agent ──────────────────────────
    const agent = await createToolCallingAgent({
      llm: activeModel,
      tools,
      prompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools,
      returnIntermediateSteps: true,
      maxIterations: 5,
    });

    const response = await executor.invoke({
      input: userMessage,
      chat_history: chatHistory,
    });

    const agentAnswer = response.output;

    // ── Step 6: Extract Citations/Sources from Intermediate Steps ──
    let sources: any[] = [];
    if (response.intermediateSteps) {
      for (const step of response.intermediateSteps) {
        if (step.action.tool === 'search_documents') {
          try {
            const parsed = JSON.parse(step.observation);
            if (Array.isArray(parsed)) {
              sources = [...sources, ...parsed];
            }
          } catch (e) {
            this.logger.warn(`Failed parsing tool search results: ${e.message}`);
          }
        }
      }
    }

    // ── Step 7: Persist Conversation ────────────────────────────────
    await this.prisma.chatMessage.create({
      data: {
        userId: effectiveUserId,
        sessionId: session ? session.id : null,
        role: 'user',
        message: userMessage,
        sources: (Prisma as any).DbNull,
      },
    });

    const savedAgentMsg = await this.prisma.chatMessage.create({
      data: {
        userId: effectiveUserId,
        sessionId: session ? session.id : null,
        role: 'assistant',
        message: agentAnswer,
        sources: sources.length > 0 ? (sources as any) : (Prisma as any).DbNull,
      },
    });

    // Bump updatedAt on session
    if (session) {
      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date() },
      });
    }

    return {
      answer: agentAnswer,
      sources,
      userId: effectiveUserId,
      messageId: savedAgentMsg.id,
      sessionId: session?.id,
    };
  }
}
