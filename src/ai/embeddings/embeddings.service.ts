import { Injectable, Logger } from '@nestjs/common';
import { ConfigService, AiProvider } from '../../config/config.service';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly embeddingsModel: any;

  constructor(private readonly configService: ConfigService) {
    const provider = this.configService.aiProvider;
    const isGeminiTokenExpired = this.configService.geminiApiKey?.startsWith('AQ.');

    if (
      provider === AiProvider.OPENROUTER ||
      provider === AiProvider.GROQ ||
      isGeminiTokenExpired
    ) {
      this.logger.log('Initializing EmbeddingsService using OpenRouter (openai/text-embedding-3-small @ 768-dim)');
      this.embeddingsModel = new OpenAIEmbeddings({
        apiKey: this.configService.openRouterApiKey,
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
        },
        modelName: 'openai/text-embedding-3-small',
        dimensions: 768,
      });
    } else {
      this.logger.log('Initializing EmbeddingsService using Google Gemini (text-embedding-004)');
      this.embeddingsModel = new GoogleGenerativeAIEmbeddings({
        apiKey: this.configService.geminiApiKey,
        modelName: 'text-embedding-004',
      });
    }
  }

  /**
   * Embed a single query string into a 768-dim float array.
   */
  async embedQuery(text: string): Promise<number[]> {
    return this.embeddingsModel.embedQuery(text);
  }

  /**
   * Embed a batch of text chunk strings into an array of 768-dim float arrays.
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    return this.embeddingsModel.embedDocuments(documents);
  }
}
