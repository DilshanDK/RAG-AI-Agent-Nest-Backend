import { Controller, Post, Param, Body, BadRequestException } from '@nestjs/common';
import { RagService } from './rag.service';

export class SearchQueryDto {
  query: string;
  topK?: number;
  minScore?: number;
}

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ingest/:documentId')
  async ingestDocument(@Param('documentId') documentId: string) {
    return this.ragService.ingestDocument(documentId);
  }

  @Post('search')
  async search(@Body() body: SearchQueryDto) {
    if (!body || !body.query) {
      throw new BadRequestException('Please provide a "query" string in request body.');
    }
    const topK = body.topK || 4;
    const minScore = body.minScore !== undefined ? body.minScore : 0.2;
    return this.ragService.searchSimilarity(body.query, topK, minScore);
  }
}
