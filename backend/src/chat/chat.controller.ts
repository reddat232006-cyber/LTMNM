import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Chat - Tin nhắn trực tuyến WebSocket')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ / Admin] Lấy hộp thư tổng hợp các phòng có khách nhắn tin' })
  getConversations() {
    return this.chatService.getConversations();
  }

  @Get('room/:roomId')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn chat trực tiếp của một phòng trọ' })
  getHistory(@Param('roomId') roomId: string) {
    return this.chatService.getMessagesByRoom(roomId);
  }
}
