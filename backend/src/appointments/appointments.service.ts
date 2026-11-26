import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Appointment, AppointmentDocument, AppointmentStatus } from './schemas/appointment.schema';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { Room, RoomDocument } from '../rooms/schemas/room.schema';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
  ) {}

  async create(createDto: CreateAppointmentDto): Promise<AppointmentDocument> {
    if (!Types.ObjectId.isValid(createDto.roomId)) {
      throw new BadRequestException('ID phòng trọ không hợp lệ');
    }

    const room = await this.roomModel.findById(createDto.roomId).exec();
    if (!room) {
      throw new NotFoundException('Phòng trọ không tồn tại hoặc đã bị gỡ bỏ');
    }

    if (!createDto.isWaitlist && room.status === 'full') {
      throw new BadRequestException(
        'Phòng này hiện đã hết chỗ. Vui lòng chọn phòng khác hoặc đăng ký nhận thông báo khi có phòng trống!',
      );
    }

    // Kiểm tra định dạng ngày YYYY-MM-DD hợp lệ và không nằm trong quá khứ
    const dateStr = (createDto.appointmentDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('Ngày hẹn không hợp lệ (định dạng yêu cầu: YYYY-MM-DD)');
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (
      parsed.getFullYear() !== y ||
      parsed.getMonth() !== m - 1 ||
      parsed.getDate() !== d
    ) {
      throw new BadRequestException('Ngày hẹn không tồn tại trên lịch');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) {
      throw new BadRequestException('Không thể đặt lịch hẹn cho ngày trong quá khứ');
    }

    const newAppointment = new this.appointmentModel({
      roomId: new Types.ObjectId(createDto.roomId),
      roomTitle: room.title,
      tenantName: createDto.tenantName,
      tenantPhone: createDto.tenantPhone,
      tenantEmail: createDto.tenantEmail ? createDto.tenantEmail.toLowerCase().trim() : '',
      appointmentDate: dateStr,
      appointmentTime: createDto.appointmentTime,
      note: createDto.note || '',
      isWaitlist: !!createDto.isWaitlist,
      status: AppointmentStatus.PENDING,
    });

    return newAppointment.save();
  }

  async cancelMyAppointment(
    id: string,
    userEmail: string,
    userRole: string,
  ): Promise<AppointmentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID lịch hẹn không hợp lệ');
    }
    const appt = await this.appointmentModel.findById(id).exec();
    if (!appt) {
      throw new NotFoundException('Không tìm thấy lịch hẹn');
    }
    const normEmail = (userEmail || '').toLowerCase().trim();
    if (userRole !== 'admin' && appt.tenantEmail !== normEmail) {
      throw new ForbiddenException('Bạn chỉ được hủy lịch hẹn của chính mình');
    }
    if (appt.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Lịch hẹn này đã được hủy trước đó');
    }
    appt.status = AppointmentStatus.CANCELLED;
    return appt.save();
  }

  async findMyAppointments(email: string): Promise<AppointmentDocument[]> {
    return this.appointmentModel
      .find({ tenantEmail: email.toLowerCase().trim() })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByRoom(roomId: string): Promise<AppointmentDocument[]> {
    return this.appointmentModel
      .find({ roomId: new Types.ObjectId(roomId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findAll(): Promise<AppointmentDocument[]> {
    return this.appointmentModel.find().sort({ createdAt: -1 }).exec();
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<AppointmentDocument> {
    const appt = await this.appointmentModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );
    if (!appt) {
      throw new NotFoundException('Không tìm thấy lịch hẹn');
    }
    return appt;
  }
}
