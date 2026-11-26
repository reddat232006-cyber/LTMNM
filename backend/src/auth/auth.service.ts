import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { ApprovalStatus } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    if (registerDto.role === 'admin') {
      throw new BadRequestException('Không thể tự đăng ký tài khoản Quản trị viên (Admin)');
    }

    const existing = await this.usersService.findByEmail(registerDto.email);
    if (existing) {
      throw new BadRequestException('Email này đã được sử dụng hoặc đang chờ duyệt');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(registerDto.password, salt);

    const isLandlord = registerDto.role === 'landlord';

    const user = await this.usersService.create({
      email: registerDto.email,
      phone: registerDto.phone,
      fullName: registerDto.fullName,
      passwordHash,
      role: registerDto.role,
      registerReason: isLandlord ? (registerDto.registerReason || '') : '',
      approvalStatus: isLandlord ? ApprovalStatus.PENDING : ApprovalStatus.APPROVED,
      isVerified: !isLandlord,
      isActive: true,
    });

    // Chủ trọ: chờ Admin phê duyệt
    if (isLandlord) {
      return {
        message: 'Đã gửi yêu cầu đăng ký Chủ trọ! Vui lòng chờ Quản trị viên (Admin) phê duyệt trước khi đăng nhập.',
        approvalStatus: ApprovalStatus.PENDING,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          approvalStatus: user.approvalStatus,
        },
      };
    }

    // Người thuê: kích hoạt ngay lập tức và cấp JWT token đăng nhập luôn
    const payload = { sub: user._id, email: user.email, role: user.role, fullName: user.fullName };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'Đăng ký tài khoản Người thuê thành công!',
      approvalStatus: ApprovalStatus.APPROVED,
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar || '',
        isVerified: true,
        approvalStatus: ApprovalStatus.APPROVED,
      },
    };
  }

  async login(loginDto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (user.approvalStatus === ApprovalStatus.PENDING) {
      throw new UnauthorizedException('Tài khoản của bạn đang chờ Admin phê duyệt. Vui lòng quay lại sau!');
    }

    if (user.approvalStatus === ApprovalStatus.REJECTED) {
      throw new UnauthorizedException('Yêu cầu đăng ký tài khoản của bạn đã bị Admin từ chối.');
    }

    if (user.role !== 'admin' && user.isActive === false) {
      throw new UnauthorizedException('Tài khoản của bạn đã bị Quản trị viên tạm khóa');
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      await this.usersService.recordLogin(String(user._id), meta?.ip || '127.0.0.1', meta?.userAgent || 'Browser', 'failed');
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    // Ghi nhật ký đăng nhập thành công vào MongoDB
    await this.usersService.recordLogin(String(user._id), meta?.ip || '127.0.0.1', meta?.userAgent || 'Browser', 'success');

    const payload = { sub: user._id, email: user.email, role: user.role, fullName: user.fullName };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'Đăng nhập thành công',
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        isVerified: user.isVerified,
        approvalStatus: user.approvalStatus,
      },
    };
  }
}
