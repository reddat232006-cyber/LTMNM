import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  TENANT = 'tenant',     // Người thuê (Sinh viên & Người lao động)
  LANDLORD = 'landlord', // Chủ trọ
  ADMIN = 'admin',       // Quản trị viên
  STUDENT = 'student',   // (Tương thích dữ liệu cũ)
  WORKER = 'worker',     // (Tương thích dữ liệu cũ)
}

export enum ApprovalStatus {
  PENDING = 'pending',   // Đang chờ Admin duyệt
  APPROVED = 'approved', // Đã được Admin duyệt
  REJECTED = 'rejected', // Đã bị Admin từ chối
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.STUDENT })
  role: UserRole;

  @Prop({ type: String, enum: ApprovalStatus, default: ApprovalStatus.PENDING })
  approvalStatus: ApprovalStatus;

  @Prop({ default: '' })
  registerReason: string; // Thông tin xác minh / Lý do đăng ký gửi Admin

  @Prop({ default: '' })
  avatar: string;

  @Prop({ default: false })
  isVerified: boolean; // Tích xanh xác thực danh tính / CCCD

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: [
      {
        loginAt: { type: Date, default: Date.now },
        ip: { type: String, default: '' },
        userAgent: { type: String, default: '' },
        status: { type: String, default: 'success' },
      },
    ],
    default: [],
  })
  loginHistory: {
    loginAt: Date;
    ip: string;
    userAgent: string;
    status: string;
  }[];
}

export const UserSchema = SchemaFactory.createForClass(User);
