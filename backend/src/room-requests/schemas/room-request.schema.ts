import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomRequestDocument = RoomRequest & Document;

@Schema({ timestamps: true })
export class RoomRequest {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  tenantId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  tenantName: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ default: 'all' })
  district: string;

  @Prop({ default: 'Đà Nẵng' })
  districtName: string;

  @Prop({ required: true })
  maxBudget: number;

  @Prop({ default: 1 })
  peopleCount: number;

  @Prop({ default: 'phong-tro' })
  roomType: string;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ default: 'Linh hoạt / Dọn vào ngay' })
  moveInDate: string;

  @Prop({ default: '' })
  note: string;

  @Prop({ enum: ['open', 'matched'], default: 'open' })
  status: 'open' | 'matched';

  @Prop({ default: 0 })
  likes: number;

  @Prop({
    type: [
      {
        landlordId: { type: String, default: '' },
        landlordName: { type: String, required: true },
        landlordPhone: { type: String, required: true },
        roomId: { type: String, default: '' },
        roomTitle: { type: String, default: '' },
        offerPrice: { type: Number, default: 0 },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  offers: {
    landlordId?: string;
    landlordName: string;
    landlordPhone: string;
    roomId?: string;
    roomTitle?: string;
    offerPrice?: number;
    message: string;
    createdAt: Date;
  }[];
}

export const RoomRequestSchema = SchemaFactory.createForClass(RoomRequest);
