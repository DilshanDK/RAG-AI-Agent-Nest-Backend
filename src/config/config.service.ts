import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export enum AiProvider {
  GROQ = 'groq',
  GEMINI = 'gemini',
  OPENROUTER = 'openrouter',
}

class EnvironmentVariables {
  @IsNumber()
  @IsOptional()
  PORT = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  GEMINI_API_KEY: string;

  @IsString()
  GROQ_API_KEY: string;

  @IsString()
  OPENROUTER_API_KEY: string;

  @IsEnum(AiProvider)
  @IsOptional()
  AI_PROVIDER: AiProvider = AiProvider.GROQ;

  @IsString()
  @IsOptional()
  GROQ_MODEL = 'llama-3.1-8b-instant';

  @IsString()
  @IsOptional()
  OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

  @IsString()
  @IsOptional()
  GEMINI_MODEL = 'gemini-1.5-flash';
}

@Injectable()
export class ConfigService {
  private readonly envConfig: EnvironmentVariables;

  constructor(private nestConfigService: NestConfigService) {
    const config = {
      PORT: Number(this.nestConfigService.get<string>('PORT') || 3000),
      DATABASE_URL: this.nestConfigService.get<string>('DATABASE_URL'),
      GEMINI_API_KEY: this.nestConfigService.get<string>('GEMINI_API_KEY'),
      GROQ_API_KEY: this.nestConfigService.get<string>('GROQ_API_KEY'),
      OPENROUTER_API_KEY: this.nestConfigService.get<string>('OPENROUTER_API_KEY'),
      AI_PROVIDER: this.nestConfigService.get<string>('AI_PROVIDER'),
      GROQ_MODEL: this.nestConfigService.get<string>('GROQ_MODEL'),
      OPENROUTER_MODEL: this.nestConfigService.get<string>('OPENROUTER_MODEL'),
      GEMINI_MODEL: this.nestConfigService.get<string>('GEMINI_MODEL'),
    };

    const validatedConfig = plainToInstance(EnvironmentVariables, config, {
      enableImplicitConversion: true,
    });

    const errors = validateSync(validatedConfig, { skipMissingProperties: false });

    if (errors.length > 0) {
      throw new Error(`Config validation error: ${errors.toString()}`);
    }

    this.envConfig = validatedConfig;
  }

  get port(): number {
    return this.envConfig.PORT;
  }

  get databaseUrl(): string {
    return this.envConfig.DATABASE_URL;
  }

  get geminiApiKey(): string {
    return this.envConfig.GEMINI_API_KEY;
  }

  get groqApiKey(): string {
    return this.envConfig.GROQ_API_KEY;
  }

  get openRouterApiKey(): string {
    return this.envConfig.OPENROUTER_API_KEY;
  }

  get aiProvider(): AiProvider {
    return this.envConfig.AI_PROVIDER;
  }

  get groqModel(): string {
    return this.envConfig.GROQ_MODEL;
  }

  get openRouterModel(): string {
    return this.envConfig.OPENROUTER_MODEL;
  }

  get geminiModel(): string {
    return this.envConfig.GEMINI_MODEL;
  }
}
