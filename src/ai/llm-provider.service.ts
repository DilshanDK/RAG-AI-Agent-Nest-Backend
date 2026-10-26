import { Injectable, Logger } from '@nestjs/common';
import { ConfigService, AiProvider } from '../config/config.service';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

@Injectable()
export class LlmProviderService {
  private readonly logger = new Logger(LlmProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  getDefaultProvider(): string {
    return this.configService.aiProvider || 'groq';
  }

  getChatModel(overrideProvider?: string): BaseChatModel {
    const raw = (overrideProvider || this.configService.aiProvider || 'groq').toLowerCase().trim();

    let provider: AiProvider;
    if (raw === 'gemini') {
      provider = AiProvider.GEMINI;
    } else if (raw === 'openrouter') {
      provider = AiProvider.OPENROUTER;
    } else {
      provider = AiProvider.GROQ;
    }

    this.logger.log(`Instantiating Chat Model with provider: ${provider}`);

    switch (provider) {
      case AiProvider.GEMINI:
        return new ChatGoogleGenerativeAI({
          apiKey: this.configService.geminiApiKey,
          modelName: this.configService.geminiModel,
          maxRetries: 2,
        });

      case AiProvider.OPENROUTER:
        return new ChatOpenAI({
          apiKey: this.configService.openRouterApiKey,
          modelName: this.configService.openRouterModel,
          configuration: {
            baseURL: 'https://openrouter.ai/api/v1',
          },
          maxRetries: 2,
        });

      case AiProvider.GROQ:
      default:
        return new ChatOpenAI({
          apiKey: this.configService.groqApiKey,
          modelName: this.configService.groqModel,
          configuration: {
            baseURL: 'https://api.groq.com/openai/v1',
          },
          maxRetries: 2,
        });
    }
  }
}
