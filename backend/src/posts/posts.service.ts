import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument, PostCategory } from './schemas/post.schema';

@Injectable()
export class PostsService implements OnModuleInit {
  constructor(@InjectModel(Post.name) private postModel: Model<PostDocument>) {}

  async onModuleInit() {
    const count = await this.postModel.countDocuments();
    if (count === 0) {
      await this.postModel.insertMany([
        {
          title: '📢 SVTrọ Đà Nẵng ra mắt Trợ lý AI 24/7, Chat trực tiếp & Tìm phòng quanh tôi 3km',
          summary:
            'Bản cập nhật lớn nhất giúp Sinh viên và Người lao động tìm trọ nhanh hơn với bản đồ 5 Khu Công Nghiệp, Trợ lý AI gợi ý phòng và tính năng so sánh giá.',
          content:
            'Chào mừng bạn đến với phiên bản nâng cấp mới nhất của SVTrọ Đà Nẵng!\n\nCác tính năng mới vừa được cập nhật:\n1. Trợ lý AI 24/7 ở góc dưới bên phải giúp tư vấn phòng theo ngân sách và giải đáp mọi thắc mắc.\n2. Mở rộng bản đồ 5 Khu Công Nghiệp lớn tại Đà Nẵng (Hòa Khánh, Hòa Cầm, An Đồn, Thọ Quang, Khu Công Nghệ Cao) phục vụ anh chị em công nhân.\n3. Chat trực tiếp thời gian thực với chủ trọ ngay trên web và đặt lịch hẹn xem phòng 2 chiều.\n4. So sánh 2–3 phòng cạnh nhau kèm máy tính chia tiền phòng + điện + nước theo số người ở.',
          category: PostCategory.CAP_NHAT,
          coverImage:
            'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
          authorName: 'Quản Trị Viên SVTrọ',
          isPinned: true,
          views: 128,
        },
        {
          title: '🚨 Cảnh báo 3 chiêu trò lừa đảo cọc phòng trọ mùa nhập học sinh viên cần tránh',
          summary:
            'Tuyệt đối không chuyển khoản giữ phòng trước khi xem trực tiếp, kiểm tra kỹ đồng hồ điện nước và sử dụng nút Báo cáo lừa đảo trên SVTrọ.',
          content:
            'Mỗi dịp đầu năm học hoặc đầu năm mới, tình trạng kẻ gian đăng phòng đẹp giá siêu rẻ để lừa tiền cọc sinh viên và công nhân lại gia tăng.\n\n3 nguyên tắc vàng bạn bắt buộc phải nhớ:\n• KHÔNG chuyển tiền cọc/giữ chỗ trước khi đến xem phòng tận mắt và gặp chính chủ.\n• Đọc kỹ điều khoản hoàn trả cọc trong hợp đồng thuê nhà.\n• Sử dụng mục Đánh giá & Báo cáo lừa đảo trên SVTrọ để xem nhận xét từ người thuê trước và cảnh báo cho cộng đồng.',
          category: PostCategory.CANH_BAO,
          coverImage:
            'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
          authorName: 'Ban Kiểm Duyệt SVTrọ',
          isPinned: false,
          views: 94,
        },
        {
          title: '💡 Kinh nghiệm chọn phòng trọ không ngập nước & tiết kiệm chi phí tại Đà Nẵng',
          summary:
            'Những tuyến đường cao ráo gần ĐH Bách Khoa, Đông Á, KCN Hòa Khánh và cách tính tổng chi phí điện nước hợp lý trước khi ký hợp đồng.',
          content:
            'Khi thuê trọ tại Đà Nẵng, ngoài giá phòng thì tình trạng thoát nước mùa mưa và đơn giá điện nước là yếu tố cực kỳ quan trọng.\n\nMẹo nhỏ cho bạn:\n• Ưu tiên hỏi rõ giá điện (mức hợp lý từ 3.000đ – 3.500đ/kWh) và giá nước (40.000đ – 60.000đ/người).\n• Dùng ngay "Máy tính dự toán chi phí thực tế" trong cửa sổ chi tiết phòng trên SVTrọ để biết chính xác mỗi người phải đóng bao nhiêu tiền mỗi tháng khi ở ghép.',
          category: PostCategory.KINH_NGHIEM,
          coverImage:
            'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
          authorName: 'Cộng Đồng SVTrọ',
          isPinned: false,
          views: 67,
        },
      ]);
    }
  }

  async findAll(category?: string): Promise<PostDocument[]> {
    const filter: any = {};
    if (category && category !== 'all') {
      filter.category = category;
    }
    return this.postModel.find(filter).sort({ isPinned: -1, createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID bài viết không hợp lệ');
    }
    const post = await this.postModel
      .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
      .exec();
    if (!post) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    return post;
  }

  async create(data: Partial<Post>): Promise<PostDocument> {
    const post = new this.postModel(data);
    return post.save();
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID bài viết không hợp lệ');
    }
    const deleted = await this.postModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy bài viết');
    }
    return { message: 'Đã xóa bài viết Blog thành công' };
  }

  async likePost(id: string): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID bài viết không hợp lệ');
    }
    const updated = await this.postModel
      .findByIdAndUpdate(id, { $inc: { likes: 1 } }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Không tìm thấy bài viết');
    return updated;
  }

  async addComment(
    id: string,
    comment: { authorName: string; authorRole?: string; content: string },
  ): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID bài viết không hợp lệ');
    }
    const updated = await this.postModel
      .findByIdAndUpdate(
        id,
        {
          $push: {
            comments: {
              authorName: comment.authorName || 'Người thuê',
              authorRole: comment.authorRole || 'tenant',
              content: comment.content.trim(),
              createdAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Không tìm thấy bài viết');
    return updated;
  }
}
