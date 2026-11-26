import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomDocument = Room & Document;

export enum RoomType {
  STUDIO = 'studio',
  PHONG_TRO = 'phong-tro',
  CCMN = 'ccmn',
  KTX = 'ktx',
  O_GHEP = 'o-ghep',
}

export enum RoomStatus {
  AVAILABLE = 'available',
  FULL = 'full',
  AVAILABLE_SOON = 'available-soon',
}

export enum TargetAudience {
  STUDENT = 'student', // Sinh viên
  WORKER = 'worker', // Người lao động
  ALL = 'all', // Cả hai
}

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  price: number; // Giá thuê VNĐ/tháng

  @Prop({ required: true })
  area: number; // Diện tích m2

  @Prop({ required: true })
  district: string; // lien-chieu, hai-chau, ngu-hanh-son, thanh-khe, cam-le, son-tra, hoa-vang

  @Prop({ required: true })
  districtName: string;

  @Prop({ required: true })
  address: string;

  // GeoJSON Point phục vụ MongoDB Geospatial Index ($near, $geoNear)
  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [kinh độ (lng), vĩ độ (lat)]
      required: true,
    },
  })
  location: {
    type: string;
    coordinates: number[];
  };

  @Prop({ type: String, enum: TargetAudience, default: TargetAudience.ALL })
  targetAudience: TargetAudience;

  @Prop({ default: 'all' })
  nearPlaceId: string; // id trường ĐH hoặc Khu công nghiệp gần nhất (dut, uda, kcn-hoa-khanh...)

  @Prop({ default: '' })
  nearPlaceName: string;

  @Prop({ default: 'Gần' })
  distance: string; // vd: 250m, 1.2km

  @Prop({ type: String, enum: RoomType, default: RoomType.PHONG_TRO })
  type: RoomType;

  @Prop({ type: String, enum: RoomStatus, default: RoomStatus.AVAILABLE })
  status: RoomStatus;

  @Prop({ default: 1 })
  availableCount: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  zalo: string;

  @Prop({ default: '3.200đ / kWh' })
  electricity: string;

  @Prop({ default: 80 })
  estimatedKwh: number; // Số điện (kWh/tháng) do Chủ nhà / Admin thiết lập

  @Prop({ default: '50.000đ / người' })
  water: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: true })
  verified: boolean;

  @Prop({ default: false })
  isHot: boolean;

  @Prop({ default: true })
  isApproved: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  landlordId?: Types.ObjectId;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// Thiết lập chỉ mục không gian địa lý 2dsphere cho MongoDB
RoomSchema.index({ location: '2dsphere' });
// Chỉ mục tìm kiếm văn bản full-text
RoomSchema.index({ title: 'text', address: 'text', description: 'text' });
