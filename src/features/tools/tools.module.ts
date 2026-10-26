import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { DocumentsModule } from '../documents/documents.module';
import { RagModule } from '../rag/rag.module';
import { LlmProviderModule } from '../../ai/llm-provider.module';

@Module({
  imports: [DocumentsModule, RagModule, LlmProviderModule],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
