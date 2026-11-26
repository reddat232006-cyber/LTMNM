import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument } from '../rooms/schemas/room.schema';
import { User, UserDocument, ApprovalStatus } from '../users/schemas/user.schema';
import { Appointment, AppointmentDocument } from '../appointments/schemas/appointment.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
  ) {}

  async getAdminAnalytics() {
    const [
      totalRooms,
      totalUsers,
      pendingUsers,
      totalAppointments,
      totalScamReports,
      roomsByDistrict,
      roomsByStatus,
      usersByRole,
    ] = await Promise.all([
      this.roomModel.countDocuments(),
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ approvalStatus: ApprovalStatus.PENDING }),
      this.appointmentModel.countDocuments(),
      this.reviewModel.countDocuments({ isScamReport: true }),
      // MongoDB Aggregation Pipeline: Nhóm phòng theo Quận & tính giá thuê trung bình
      this.roomModel.aggregate([
        {
          $group: {
            _id: '$districtName',
            count: { $sum: 1 },
            avgPrice: { $avg: '$price' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.roomModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.userModel.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      overview: {
        totalRooms,
        totalUsers,
        pendingUsers,
        totalAppointments,
        totalScamReports,
      },
      roomsByDistrict: roomsByDistrict.map((d) => ({
        district: d._id || 'Khác',
        count: d.count,
        avgPrice: Math.round(d.avgPrice || 0),
      })),
      roomsByStatus,
      usersByRole,
    };
  }
}
