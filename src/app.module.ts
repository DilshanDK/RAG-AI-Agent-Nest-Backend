import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { LlmProviderModule } from './ai/llm-provider.module';
import { AuthModule } from './features/auth/auth.module';
import { DocumentsModule } from './features/documents/documents.module';
import { ChatModule } from './features/chat/chat.module';
import { RagModule } from './features/rag/rag.module';
import { AgentModule } from './features/agent/agent.module';
import { ToolsModule } from './features/tools/tools.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    LlmProviderModule,
    AuthModule,
    DocumentsModule,
    ChatModule,
    RagModule,
    AgentModule,
    ToolsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
