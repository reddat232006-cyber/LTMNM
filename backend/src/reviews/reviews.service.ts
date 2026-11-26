import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(@InjectModel(Review.name) private reviewModel: Model<ReviewDocument>) {}

  async create(
    createDto: CreateReviewDto,
    author: { userId: string; fullName: string; email: string },
  ): Promise<ReviewDocument> {
    if (!Types.ObjectId.isValid(createDto.roomId)) {
      throw new BadRequestException('ID phòng trọ không hợp lệ');
    }

    const roomObjId = new Types.ObjectId(createDto.roomId);
    const authorObjId = Types.ObjectId.isValid(author.userId)
      ? new Types.ObjectId(author.userId)
      : undefined;

    // Chống spam: mỗi tài khoản chỉ được gửi 1 đánh giá / báo cáo cho mỗi phòng
    if (authorObjId) {
      const existed = await this.reviewModel
        .findOne({ roomId: roomObjId, authorId: authorObjId })
        .exec();
      if (existed) {
        throw new BadRequestException(
          'Tài khoản của bạn đã gửi đánh giá/báo cáo cho phòng này rồi!',
        );
      }
    }

    const review = new this.reviewModel({
      roomId: roomObjId,
      authorId: authorObjId,
      authorEmail: (author.email || '').toLowerCase().trim(),
      authorName: author.fullName || createDto.authorName || 'Người dùng SVTrọ',
      rating: createDto.rating,
      comment: createDto.comment,
      isScamReport: !!createDto.isScamReport,
      reportReason: createDto.reportReason || '',
    });
    return review.save();
  }

  async findByRoom(roomId: string): Promise<ReviewDocument[]> {
    return this.reviewModel
      .find({ roomId: new Types.ObjectId(roomId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findScamReports(): Promise<ReviewDocument[]> {
    return this.reviewModel.find({ isScamReport: true }).sort({ createdAt: -1 }).exec();
  }
}
