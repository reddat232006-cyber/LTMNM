import { Injectable, NotFoundException } from '@nestjs/common';
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
    const room = await this.roomModel.findById(createDto.roomId).exec();
    const roomTitle = room ? room.title : 'Phòng trọ';

    const newAppointment = new this.appointmentModel({
      roomId: new Types.ObjectId(createDto.roomId),
      roomTitle,
      tenantName: createDto.tenantName,
      tenantPhone: createDto.tenantPhone,
      tenantEmail: createDto.tenantEmail ? createDto.tenantEmail.toLowerCase().trim() : '',
      appointmentDate: createDto.appointmentDate,
      appointmentTime: createDto.appointmentTime,
      note: createDto.note || '',
      isWaitlist: !!createDto.isWaitlist,
      status: AppointmentStatus.PENDING,
    });

    return newAppointment.save();
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
