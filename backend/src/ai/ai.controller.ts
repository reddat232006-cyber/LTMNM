import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';

@ApiTags('AI Assistant - Trợ lý AI giải đáp & gợi ý phòng trọ')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Gửi câu hỏi tự nhiên cho Trợ lý AI giải đáp và gợi ý phòng từ MongoDB' })
  chat(@Body() body: { question: string }) {
    return this.aiService.handleChat(body?.question || '');
  }
}
