import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomBillingDocument = RoomBilling & Document;

@Schema({ timestamps: true })
export class RoomBilling {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, unique: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  landlordId?: Types.ObjectId;

  @Prop({ default: '' })
  tenantName: string;

  @Prop({ default: '' })
  tenantPhone: string;

  @Prop({ default: '' })
  dueDate: string; // YYYY-MM-DD (để trống nếu chưa thiết lập hạn)

  @Prop({ enum: ['unpaid', 'paid'], default: 'unpaid' })
  paymentStatus: 'unpaid' | 'paid';

  @Prop({ default: 0 })
  elecOld: number;

  @Prop({ default: 0 })
  elecNew: number;

  @Prop({ default: 1 })
  people: number;

  @Prop({ default: 0 })
  extra: number;

  @Prop({ default: 'MB' })
  bank: string;

  @Prop({ default: '' })
  account: string;
}

export const RoomBillingSchema = SchemaFactory.createForClass(RoomBilling);
