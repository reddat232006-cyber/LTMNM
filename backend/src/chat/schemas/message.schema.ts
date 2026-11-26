import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true, index: true })
  roomId: string;

  @Prop({ required: true })
  senderName: string;

  @Prop({ default: 'guest' })
  senderRole: string; // admin, landlord, student, worker, guest

  @Prop({ required: true })
  content: string;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
