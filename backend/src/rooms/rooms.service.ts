import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument, RoomStatus, TargetAudience } from './schemas/room.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';

@Injectable()
export class RoomsService {
  constructor(@InjectModel(Room.name) private roomModel: Model<RoomDocument>) {}

  async findAll(query: QueryRoomDto) {
    const filter: any = { isApproved: true };

    // 1. Lọc theo từ khóa tìm kiếm
    if (query.keyword && query.keyword.trim() !== '') {
      const regex = new RegExp(query.keyword.trim(), 'i');
      filter.$or = [
        { title: regex },
        { address: regex },
        { description: regex },
      ];
    }

    // 2. Lọc theo quận/huyện Đà Nẵng
    if (query.district && query.district !== 'all') {
      filter.district = query.district;
    }

    // 3. Lọc theo đối tượng: Sinh viên hoặc Người lao động
    if (query.targetAudience && query.targetAudience !== TargetAudience.ALL) {
      filter.targetAudience = { $in: [query.targetAudience, TargetAudience.ALL] };
    }

    // 4. Lọc theo trường ĐH hoặc Khu Công Nghiệp
    if (query.nearPlaceId && query.nearPlaceId !== 'all') {
      filter.nearPlaceId = query.nearPlaceId;
    }

    // 5. Lọc theo khoảng giá
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      filter.price = {};
      if (query.minPrice !== undefined) filter.price.$gte = Number(query.minPrice);
      if (query.maxPrice !== undefined) filter.price.$lte = Number(query.maxPrice);
    }

    // 6. Lọc theo loại hình phòng
    if (query.type && (query.type as any) !== 'all') {
      filter.type = query.type;
    }

    // 7. Lọc theo tình trạng phòng (Còn phòng / Đã hết)
    if (query.status && (query.status as any) !== 'all') {
      filter.status = query.status;
    }

    // 8. Lọc theo các tiện ích bắt buộc
    if (query.amenities) {
      const amenityArray = query.amenities.split(',').map(a => a.trim()).filter(Boolean);
      if (amenityArray.length > 0) {
        filter.amenities = { $all: amenityArray };
      }
    }

    // 9. Tìm kiếm Geospatial theo tọa độ GPS và bán kính (MongoDB 2dsphere)
    if (query.lat !== undefined && query.lng !== undefined) {
      const radiusInMeters = (query.radiusInKm || 5) * 1000;
      filter.location = {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [Number(query.lng), Number(query.lat)],
          },
          $maxDistance: radiusInMeters,
        },
      };
    }

    const rooms = await this.roomModel
      .find(filter)
      .populate('landlordId', 'fullName phone email')
      .sort({ createdAt: -1 })
      .exec();
    return {
      total: rooms.length,
      rooms,
    };
  }

  async findOne(id: string): Promise<RoomDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID phòng trọ không hợp lệ');
    }
    const room = await this.roomModel.findById(id).exec();
    if (!room) {
      throw new NotFoundException('Không tìm thấy phòng trọ');
    }
    return room;
  }

  async create(createRoomDto: CreateRoomDto, landlordId?: string): Promise<RoomDocument> {
    const roomData: any = {
      ...createRoomDto,
      location: {
        type: 'Point',
        coordinates: [createRoomDto.lng, createRoomDto.lat],
      },
    };

    if (landlordId && Types.ObjectId.isValid(landlordId)) {
      roomData.landlordId = new Types.ObjectId(landlordId);
    }

    const newRoom = new this.roomModel(roomData);
    return newRoom.save();
  }

  private assertRoomOwnership(room: RoomDocument, userId?: string, userRole?: string) {
    if (userRole === 'admin') return;
    const ownerId = room.landlordId ? String((room.landlordId as any)._id || room.landlordId) : '';
    if (!userId || !ownerId || ownerId !== String(userId)) {
      throw new ForbiddenException('🔒 Bạn chỉ được chỉnh sửa hoặc xóa phòng trọ do chính bạn đăng!');
    }
  }

  async updateStatus(
    id: string,
    status: RoomStatus,
    count?: number,
    userId?: string,
    userRole?: string,
  ): Promise<RoomDocument> {
    const room = await this.findOne(id);
    this.assertRoomOwnership(room, userId, userRole);
    room.status = status;
    if (status === RoomStatus.FULL) {
      room.availableCount = 0;
    } else if (count !== undefined) {
      room.availableCount = count;
    } else if (room.availableCount === 0) {
      room.availableCount = 1;
    }
    return room.save();
  }

  async update(
    id: string,
    updateData: Partial<Room>,
    userId?: string,
    userRole?: string,
  ): Promise<RoomDocument> {
    const room = await this.findOne(id);
    this.assertRoomOwnership(room, userId, userRole);
    const updated = await this.roomModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException('Không tìm thấy phòng trọ');
    }
    return updated;
  }

  async findMyRooms(userId: string, userRole: string): Promise<RoomDocument[]> {
    if (userRole === 'admin') {
      return this.roomModel
        .find()
        .populate('landlordId', 'fullName phone email')
        .sort({ createdAt: -1 })
        .exec();
    }
    if (!Types.ObjectId.isValid(userId)) return [];
    return this.roomModel
      .find({ landlordId: new Types.ObjectId(userId) })
      .populate('landlordId', 'fullName phone email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async remove(id: string, userId?: string, userRole?: string): Promise<{ message: string }> {
    const room = await this.findOne(id);
    this.assertRoomOwnership(room, userId, userRole);
    await this.roomModel.findByIdAndDelete(id).exec();
    return { message: 'Đã xóa phòng trọ thành công' };
  }

  // Danh mục cố định các Trường ĐH & Khu Công Nghiệp tại Đà Nẵng
  getPlaces() {
    return {
      districts: [
        { id: 'all', name: 'Tất cả các quận' },
        { id: 'lien-chieu', name: 'Quận Liên Chiểu (DUT, Sư Phạm, KCN Hòa Khánh)' },
        { id: 'ngu-hanh-son', name: 'Quận Ngũ Hành Sơn (DUE, VKU, FPT)' },
        { id: 'hai-chau', name: 'Quận Hải Châu (Đông Á, Kiến Trúc, Trung tâm)' },
        { id: 'thanh-khe', name: 'Quận Thanh Khê (Duy Tân, CĐ Thương Mại)' },
        { id: 'cam-le', name: 'Quận Cẩm Lệ (Ngoại Ngữ, KCN Hòa Cầm)' },
        { id: 'son-tra', name: 'Quận Sơn Trà (KCN Thọ Quang, An Đồn, Biển)' },
        { id: 'hoa-vang', name: 'Huyện Hòa Vang (Khu Công Nghệ Cao)' },
      ],
      universities: [
        { id: 'dut', name: 'ĐH Bách Khoa - ĐHĐN (DUT - Liên Chiểu)', district: 'lien-chieu', lat: 16.0754, lng: 108.1534 },
        { id: 'due', name: 'ĐH Kinh Tế - ĐHĐN (DUE - Ngũ Hành Sơn)', district: 'ngu-hanh-son', lat: 16.0503, lng: 108.2427 },
        { id: 'uda', name: 'ĐH Đông Á (UDA - Xô Viết Nghệ Tĩnh)', district: 'hai-chau', lat: 16.0322, lng: 108.2210 },
        { id: 'dau', name: 'ĐH Kiến Trúc Đà Nẵng (DAU - Núi Thành)', district: 'hai-chau', lat: 16.0336, lng: 108.2230 },
        { id: 'ued', name: 'ĐH Sư Phạm - ĐHĐN (UED - Liên Chiểu)', district: 'lien-chieu', lat: 16.0602, lng: 108.1585 },
        { id: 'dtu', name: 'ĐH Duy Tân (DTU - Nguyễn Văn Linh / Hòa Khánh)', district: 'thanh-khe', lat: 16.0610, lng: 108.2120 },
        { id: 'ufls', name: 'ĐH Ngoại Ngữ - ĐHĐN (UFLS - Cẩm Lệ)', district: 'cam-le', lat: 16.0350, lng: 108.2105 },
        { id: 'vku', name: 'ĐH CNTT & TT Việt - Hàn (VKU - Hòa Quý)', district: 'ngu-hanh-son', lat: 15.9753, lng: 108.2520 },
        { id: 'fpt', name: 'ĐH FPT Đà Nẵng (KĐT FPT City)', district: 'ngu-hanh-son', lat: 15.9877, lng: 108.2612 },
      ],
      industrialZones: [
        { id: 'kcn-hoa-khanh', name: 'KCN Hòa Khánh & Hòa Khánh Mở Rộng (Liên Chiểu)', district: 'lien-chieu', lat: 16.0825, lng: 108.1365 },
        { id: 'kcn-hoa-cam', name: 'KCN Hòa Cầm (Cẩm Lệ)', district: 'cam-le', lat: 16.0125, lng: 108.1880 },
        { id: 'kcn-an-don', name: 'KCN Đà Nẵng (An Đồn - Sơn Trà)', district: 'son-tra', lat: 16.0715, lng: 108.2395 },
        { id: 'kcn-tho-quang', name: 'KCN Dịch vụ Thủy sản Thọ Quang (Sơn Trà)', district: 'son-tra', lat: 16.1040, lng: 108.2430 },
        { id: 'kcnc-da-nang', name: 'Khu Công Nghệ Cao Đà Nẵng (Hòa Vang)', district: 'hoa-vang', lat: 16.0890, lng: 108.0650 },
      ],
    };
  }
}
