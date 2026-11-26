import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoomBilling, RoomBillingDocument } from './schemas/room-billing.schema';
import { Room, RoomDocument } from '../rooms/schemas/room.schema';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(RoomBilling.name) private billingModel: Model<RoomBillingDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
  ) {}

  async findAllForUser(userId: string, userRole: string): Promise<RoomBillingDocument[]> {
    if (userRole === 'admin') {
      return this.billingModel.find().sort({ updatedAt: -1 }).exec();
    }
    if (!Types.ObjectId.isValid(userId)) return [];
    const myRooms = await this.roomModel
      .find({ landlordId: new Types.ObjectId(userId) })
      .select('_id')
      .exec();
    const roomIds = myRooms.map((r) => r._id);
    if (roomIds.length === 0) return [];
    return this.billingModel.find({ roomId: { $in: roomIds } }).exec();
  }

  async upsertForRoom(
    roomId: string,
    userId: string,
    userRole: string,
    body: Partial<RoomBilling>,
  ): Promise<RoomBillingDocument> {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new BadRequestException('ID phòng trọ không hợp lệ');
    }
    const room = await this.roomModel.findById(roomId).exec();
    if (!room) {
      throw new NotFoundException('Phòng trọ không tồn tại');
    }

    const ownerId = room.landlordId ? String(room.landlordId) : '';
    if (userRole !== 'admin' && (!ownerId || ownerId !== String(userId))) {
      throw new ForbiddenException('Bạn chỉ được cập nhật hóa đơn cho phòng do chính mình quản lý!');
    }

    const dueDate = (body.dueDate || '').trim();
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      throw new BadRequestException('Ngày hạn thanh toán không hợp lệ (YYYY-MM-DD)');
    }

    const updatePayload = {
      roomId: new Types.ObjectId(roomId),
      landlordId: room.landlordId || (Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined),
      tenantName: (body.tenantName || '').trim(),
      tenantPhone: (body.tenantPhone || '').trim(),
      dueDate,
      paymentStatus: body.paymentStatus === 'paid' ? 'paid' : 'unpaid',
      elecOld: Math.max(0, Number(body.elecOld) || 0),
      elecNew: Math.max(0, Number(body.elecNew) || 0),
      people: Math.max(1, Number(body.people) || 1),
      extra: Math.max(0, Number(body.extra) || 0),
      bank: body.bank || 'MB',
      account: (body.account || '').trim(),
    };

    return this.billingModel
      .findOneAndUpdate({ roomId: new Types.ObjectId(roomId) }, updatePayload, {
        new: true,
        upsert: true,
      })
      .exec();
  }
}
