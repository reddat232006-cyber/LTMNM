import { Injectable, NotFoundException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoomRequest, RoomRequestDocument } from './schemas/room-request.schema';

@Injectable()
export class RoomRequestsService implements OnModuleInit {
  constructor(
    @InjectModel(RoomRequest.name) private requestModel: Model<RoomRequestDocument>,
  ) {}

  async onModuleInit() {
    const count = await this.requestModel.countDocuments().exec();
    if (count === 0) {
      await this.requestModel.insertMany([
        {
          title: 'Cần tìm phòng trọ khép kín có gác lửng gần ĐH Bách Khoa',
          tenantName: 'Nguyễn Minh Quân',
          phone: '0914222333',
          district: 'lien-chieu',
          districtName: 'Quận Liên Chiểu',
          maxBudget: 2500000,
          peopleCount: 2,
          roomType: 'phong-tro',
          amenities: ['may-lanh', 'gac-lung', 've-sinh-rieng', 'gio-tu-do'],
          moveInDate: 'Đầu tháng tới',
          note: '2 bạn sinh viên năm 2 cần phòng sạch sẽ, giờ giấc tự do, gần đường Nguyễn Lương Bằng hoặc Ngô Sĩ Liên. Ở lâu dài, sẵn sàng ký hợp đồng 6-12 tháng.',
          status: 'open',
          offers: [],
        },
        {
          title: 'Tìm phòng Studio / CCMN có máy giặt gần KCN Hòa Khánh hoặc Hải Châu',
          tenantName: 'Trần Thị Thu Hà',
          phone: '0935888777',
          district: 'hai-chau',
          districtName: 'Quận Hải Châu',
          maxBudget: 3500000,
          peopleCount: 1,
          roomType: 'studio',
          amenities: ['may-lanh', 'may-giat', 'wifi', 'khoa-van-tay'],
          moveInDate: 'Dọn vào ngay tuần này',
          note: 'Nhân viên văn phòng đi làm giờ hành chính, ưu tiên khu vực yên tĩnh, an ninh tốt, có chỗ để xe an toàn.',
          status: 'open',
          offers: [],
        },
      ]);
    }
  }

  async findAll(district?: string, status?: string): Promise<RoomRequestDocument[]> {
    const filter: any = {};
    if (district && district !== 'all') filter.district = district;
    if (status && status !== 'all') filter.status = status;
    return this.requestModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async create(body: Partial<RoomRequest>, userId?: string): Promise<RoomRequestDocument> {
    const docData: any = {
      title: body.title,
      tenantName: body.tenantName,
      phone: body.phone,
      district: body.district || 'all',
      districtName: body.districtName || 'Đà Nẵng',
      maxBudget: Number(body.maxBudget) || 2500000,
      peopleCount: Number(body.peopleCount) || 1,
      roomType: body.roomType || 'phong-tro',
      amenities: Array.isArray(body.amenities) ? body.amenities : [],
      moveInDate: body.moveInDate || 'Linh hoạt',
      note: body.note || '',
      status: 'open',
    };
    if (userId && Types.ObjectId.isValid(userId)) {
      docData.tenantId = new Types.ObjectId(userId);
    }
    const created = new this.requestModel(docData);
    return created.save();
  }

  async likeRequest(id: string): Promise<RoomRequestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID bài viết không hợp lệ');
    }
    const updated = await this.requestModel
      .findByIdAndUpdate(id, { $inc: { likes: 1 } }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Không tìm thấy bài viết');
    return updated;
  }

  async addOffer(
    id: string,
    offer: {
      landlordId?: string;
      landlordName: string;
      landlordPhone: string;
      roomId?: string;
      roomTitle?: string;
      offerPrice?: number;
      message: string;
    },
  ): Promise<RoomRequestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID tin tìm phòng không hợp lệ');
    }
    const reqDoc = await this.requestModel.findById(id).exec();
    if (!reqDoc) throw new NotFoundException('Không tìm thấy tin tìm phòng');

    reqDoc.offers.push({
      landlordId: offer.landlordId || '',
      landlordName: offer.landlordName,
      landlordPhone: offer.landlordPhone,
      roomId: offer.roomId || '',
      roomTitle: offer.roomTitle || '',
      offerPrice: Number(offer.offerPrice) || 0,
      message: offer.message,
      createdAt: new Date(),
    });
    return reqDoc.save();
  }

  async updateStatus(
    id: string,
    status: 'open' | 'matched',
    userId: string,
    userRole: string,
  ): Promise<RoomRequestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID tin tìm phòng không hợp lệ');
    }
    const reqDoc = await this.requestModel.findById(id).exec();
    if (!reqDoc) throw new NotFoundException('Không tìm thấy tin tìm phòng');

    if (userRole !== 'admin' && String(reqDoc.tenantId || '') !== String(userId)) {
      throw new ForbiddenException('Chỉ người đăng tin hoặc Admin mới được cập nhật trạng thái!');
    }
    reqDoc.status = status;
    return reqDoc.save();
  }

  async remove(id: string, userId: string, userRole: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID tin tìm phòng không hợp lệ');
    }
    const reqDoc = await this.requestModel.findById(id).exec();
    if (!reqDoc) throw new NotFoundException('Không tìm thấy tin tìm phòng');

    if (userRole !== 'admin' && String(reqDoc.tenantId || '') !== String(userId)) {
      throw new ForbiddenException('Chỉ người đăng tin hoặc Admin mới được xóa tin này!');
    }
    await this.requestModel.findByIdAndDelete(id).exec();
    return { message: 'Đã xóa tin tìm phòng thành công' };
  }
}
