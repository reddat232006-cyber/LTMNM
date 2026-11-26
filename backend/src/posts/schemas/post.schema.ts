import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostDocument = Post & Document;

export enum PostCategory {
  CAP_NHAT = 'cap-nhat',       // Cập nhật mới của hệ thống
  KINH_NGHIEM = 'kinh-nghiem', // Kinh nghiệm thuê trọ SV & NLĐ
  CANH_BAO = 'canh-bao',       // Cảnh báo lừa đảo
  UU_DAI = 'uu-dai',           // Ưu đãi / Tin tức
}

@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String, enum: PostCategory, default: PostCategory.CAP_NHAT })
  category: PostCategory;

  @Prop({
    default:
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
  })
  coverImage: string;

  @Prop({ default: 'Quản Trị Viên SVTrọ' })
  authorName: string;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  likes: number;

  @Prop({
    type: [
      {
        authorName: { type: String, required: true },
        authorRole: { type: String, default: 'tenant' },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  comments: {
    authorName: string;
    authorRole: string;
    content: string;
    createdAt: Date;
  }[];
}

export const PostSchema = SchemaFactory.createForClass(Post);
