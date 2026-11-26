import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(@InjectModel(Review.name) private reviewModel: Model<ReviewDocument>) {}

  async create(createDto: CreateReviewDto): Promise<ReviewDocument> {
    const review = new this.reviewModel({
      roomId: new Types.ObjectId(createDto.roomId),
      authorName: createDto.authorName,
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
