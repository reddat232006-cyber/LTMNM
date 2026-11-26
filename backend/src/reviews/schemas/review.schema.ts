import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  authorId?: Types.ObjectId;

  @Prop({ default: '' })
  authorEmail?: string;

  @Prop({ required: true })
  authorName: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number; // 1 đến 5 sao

  @Prop({ required: true })
  comment: string;

  @Prop({ default: false })
  isScamReport: boolean; // Cờ báo cáo lừa đảo

  @Prop({ default: '' })
  reportReason: string; // Lý do báo cáo (ví dụ: 'Giá ảo', 'Thu tiền cọc trước nhưng không giao phòng')
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
