import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, ApprovalStatus, UserRole } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(userData: Partial<User>): Promise<UserDocument> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-passwordHash').exec();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  async updateProfile(id: string, updateData: Partial<User>): Promise<UserDocument> {
    delete updateData.passwordHash;
    delete updateData.role; // Không cho tự đổi role
    const updated = await this.userModel.findByIdAndUpdate(id, updateData, { new: true }).select('-passwordHash').exec();
    if (!updated) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return updated;
  }

  async getAllUsers(): Promise<UserDocument[]> {
    return this.userModel.find().select('-passwordHash').sort({ createdAt: -1 }).exec();
  }

  async updateUserRole(id: string, role: string): Promise<UserDocument> {
    const existing = await this.userModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (existing.email === 'admin@svtro.vn' && role !== UserRole.ADMIN) {
      throw new BadRequestException('Không thể thay đổi quyền của tài khoản Quản trị viên gốc (Admin)');
    }
    const updated = await this.userModel
      .findByIdAndUpdate(id, { role }, { new: true })
      .select('-passwordHash')
      .exec();
    return updated;
  }

  async toggleUserActive(id: string, isActive: boolean): Promise<UserDocument> {
    const existing = await this.userModel.findById(id).exec();
    if (!existing) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (existing.role === UserRole.ADMIN && isActive === false) {
      throw new BadRequestException('Không thể khóa tài khoản Quản trị viên (Admin)!');
    }
    const updated = await this.userModel
      .findByIdAndUpdate(id, { isActive }, { new: true })
      .select('-passwordHash')
      .exec();
    return updated;
  }

  async getPendingUsers(): Promise<UserDocument[]> {
    return this.userModel
      .find({ approvalStatus: ApprovalStatus.PENDING })
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .exec();
  }

  async approveUser(id: string): Promise<UserDocument> {
    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        { approvalStatus: ApprovalStatus.APPROVED, isVerified: true, isActive: true },
        { new: true },
      )
      .select('-passwordHash')
      .exec();
    if (!updated) {
      throw new NotFoundException('Không tìm thấy yêu cầu đăng ký');
    }
    return updated;
  }

  async rejectUser(id: string): Promise<UserDocument> {
    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        { approvalStatus: ApprovalStatus.REJECTED, isActive: false },
        { new: true },
      )
      .select('-passwordHash')
      .exec();
    if (!updated) {
      throw new NotFoundException('Không tìm thấy yêu cầu đăng ký');
    }
    return updated;
  }

  async recordLogin(id: string, ip: string, userAgent: string, status = 'success') {
    await this.userModel
      .findByIdAndUpdate(id, {
        $push: {
          loginHistory: {
            $each: [{ loginAt: new Date(), ip: ip || 'localhost', userAgent: userAgent || 'Web Browser', status }],
            $position: 0,
            $slice: 20, // Lưu 20 lần đăng nhập gần nhất
          },
        },
      })
      .exec();
  }

  async getLoginHistory(id: string) {
    const user = await this.userModel.findById(id).select('loginHistory email fullName').exec();
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user.loginHistory || [];
  }

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();
    return { message: 'Đổi mật khẩu thành công!' };
  }
}
