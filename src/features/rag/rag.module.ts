import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { EmbeddingsService } from '../../ai/embeddings/embeddings.service';

@Module({
  controllers: [RagController],
  providers: [RagService, EmbeddingsService],
  exports: [RagService, EmbeddingsService],
})
export class RagModule {}
