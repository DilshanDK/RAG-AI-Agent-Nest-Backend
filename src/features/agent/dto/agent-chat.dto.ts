import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class AgentChatDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}
