import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ToolsModule } from '../tools/tools.module';
import { LlmProviderModule } from '../../ai/llm-provider.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [ToolsModule, LlmProviderModule, PrismaModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
