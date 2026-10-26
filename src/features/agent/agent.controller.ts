import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentChatDto } from './dto/agent-chat.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * POST /agent/chat
   * Run the intelligent LangChain agent reasoning loop.
   */
  @Post('chat')
  async chatWithAgent(@Body() body: AgentChatDto) {
    if (!body || !body.message || body.message.trim().length === 0) {
      throw new BadRequestException(
        'Please provide a non-empty "message" string in request body.'
      );
    }
    return this.agentService.runAgent(
      body.message.trim(),
      body.userId,
      body.sessionId,
      body.documentId,
      body.provider,
    );
  }
}
