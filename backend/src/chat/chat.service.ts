import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ChatService {
  constructor(@InjectModel(Message.name) private messageModel: Model<MessageDocument>) {}

  async createMessage(data: {
    roomId: string;
    senderName: string;
    senderRole: string;
    content: string;
  }): Promise<MessageDocument> {
    const msg = new this.messageModel(data);
    return msg.save();
  }

  async getMessagesByRoom(roomId: string): Promise<MessageDocument[]> {
    return this.messageModel.find({ roomId }).sort({ createdAt: 1 }).limit(100).exec();
  }

  // Gom nhóm các cuộc hội thoại theo phòng cho Chủ trọ & Admin (MongoDB Aggregation)
  async getConversations() {
    return this.messageModel.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$roomId',
          lastMessage: { $first: '$content' },
          lastSender: { $first: '$senderName' },
          lastSenderRole: { $first: '$senderRole' },
          lastTime: { $first: '$createdAt' },
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { lastTime: -1 } },
    ]);
  }
}
