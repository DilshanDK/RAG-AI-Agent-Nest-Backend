import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { LlmProviderService } from './llm-provider.service';

export const CHAT_MODEL = 'CHAT_MODEL';

@Module({
  imports: [ConfigModule],
  providers: [
    LlmProviderService,
    {
      provide: CHAT_MODEL,
      useFactory: (llmProviderService: LlmProviderService) => {
        return llmProviderService.getChatModel();
      },
      inject: [LlmProviderService],
    },
  ],
  exports: [CHAT_MODEL, LlmProviderService],
})
export class LlmProviderModule {}
