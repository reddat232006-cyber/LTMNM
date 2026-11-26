import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AppointmentDocument = Appointment & Document;

export enum AppointmentStatus {
  PENDING = 'pending', // Chờ chủ trọ xác nhận
  CONFIRMED = 'confirmed', // Đã đồng ý
  CANCELLED = 'cancelled', // Đã hủy
}

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  roomTitle: string;

  @Prop({ required: true })
  tenantName: string;

  @Prop({ required: true })
  tenantPhone: string;

  @Prop({ default: '' })
  tenantEmail: string;

  @Prop({ required: true })
  appointmentDate: string; // Ngày hẹn (YYYY-MM-DD)

  @Prop({ required: true })
  appointmentTime: string; // Khung giờ (vd: 09:30, 17:00)

  @Prop({ default: '' })
  note: string;

  @Prop({ default: false })
  isWaitlist: boolean; // True nếu khách đăng ký chờ báo khi có phòng trống

  @Prop({ type: String, enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status: AppointmentStatus;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
