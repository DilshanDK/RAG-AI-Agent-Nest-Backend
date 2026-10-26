import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RagModule } from '../rag/rag.module';
import { LlmProviderModule } from '../../ai/llm-provider.module';

@Module({
  imports: [PrismaModule, RagModule, LlmProviderModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
