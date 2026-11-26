import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  @SubscribeMessage('joinRoom')
  handleJoinRoom(@MessageBody() data: { roomId: string }, @ConnectedSocket() client: Socket) {
    if (data?.roomId) {
      client.join(`room_${data.roomId}`);
    }
    return { status: 'joined', roomId: data?.roomId };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody()
    data: {
      roomId: string;
      senderName: string;
      senderRole?: string;
      content: string;
    },
  ) {
    if (!data?.roomId || !data?.content?.trim()) return;

    const saved = await this.chatService.createMessage({
      roomId: data.roomId,
      senderName: data.senderName || 'Khách thuê',
      senderRole: data.senderRole || 'guest',
      content: data.content.trim(),
    });

    this.server.to(`room_${data.roomId}`).emit('newMessage', saved);
    return saved;
  }
}
