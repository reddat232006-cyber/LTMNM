import { IsEmail, IsNotEmpty, MinLength, IsEnum, IsOptional, Matches, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/schemas/user.schema';

export class RegisterDto {
  @ApiProperty({ example: 'sinhvien@gmail.com', description: 'Email đăng ký' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @ApiProperty({ example: '0905123456', description: 'Số điện thoại liên hệ' })
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^[0-9]{10}$/, { message: 'Số điện thoại phải gồm 10 chữ số' })
  phone: string;

  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên đầy đủ' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  fullName: string;

  @ApiProperty({ example: '123456', description: 'Mật khẩu (tối thiểu 6 ký tự)' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.TENANT,
    description: 'Vai trò: tenant (người thuê - sinh viên & người lao động), landlord (chủ trọ)',
  })
  @IsEnum(UserRole, { message: 'Vai trò không hợp lệ (tenant hoặc landlord)' })
  role: UserRole;

  @ApiPropertyOptional({ example: 'Chủ dãy trọ 8 phòng đường Âu Cơ / SV Bách Khoa tìm ở ghép' })
  @IsOptional()
  @IsString()
  registerReason?: string;
}
