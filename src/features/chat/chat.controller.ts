import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import {
  SendMessageDto,
  CreateSessionDto,
  UpdateSessionDto,
} from './dto/chat-message.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /chat
   * Send a message and get a RAG-grounded response from the LLM.
   */
  @Post()
  async sendMessage(@Body() body: SendMessageDto) {
    if (!body || !body.message || body.message.trim().length === 0) {
      throw new BadRequestException(
        'Please provide a non-empty "message" string in the request body.',
      );
    }
    return this.chatService.chat(
      body.message.trim(),
      body.userId,
      body.sessionId,
      body.documentId,
      body.provider,
    );
  }

  /**
   * POST /chat/sessions
   * Create a new chat session.
   */
  @Post('sessions')
  async createSession(@Body() body: CreateSessionDto) {
    if (!body || !body.userId) {
      throw new BadRequestException('Please provide a valid userId');
    }
    return this.chatService.createSession(
      body.userId,
      body.title,
      body.documentId,
      body.provider,
    );
  }

  /**
   * GET /chat/sessions/:userId
   * List all chat sessions for a user.
   */
  @Get('sessions/:userId')
  async getSessions(@Param('userId') userId: string) {
    return this.chatService.getSessions(userId);
  }

  /**
   * PATCH /chat/sessions/:sessionId
   * Update chat session details (title, documentId, provider).
   */
  @Patch('sessions/:sessionId')
  async updateSession(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateSessionDto,
  ) {
    return this.chatService.updateSession(sessionId, body);
  }

  /**
   * DELETE /chat/sessions/:sessionId
   * Delete a chat session and all its messages.
   */
  @Delete('sessions/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    return this.chatService.deleteSession(sessionId);
  }

  /**
   * GET /chat/history/:userId
   * Retrieve conversation history for a given user and optional session.
   */
  @Get('history/:userId')
  async getHistory(
    @Param('userId') userId: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.chatService.getHistory(userId, parsedLimit, sessionId);
  }

  /**
   * DELETE /chat/history/:userId
   * Clear chat messages for a user or session.
   */
  @Delete('history/:userId')
  async clearHistory(
    @Param('userId') userId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.chatService.clearHistory(userId, sessionId);
  }
}
