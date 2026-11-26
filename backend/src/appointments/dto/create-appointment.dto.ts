import { IsNotEmpty, IsString, Matches, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: '673d328498...', description: 'ID của phòng trọ' })
  @IsNotEmpty()
  @IsString()
  roomId: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsNotEmpty()
  @IsString()
  tenantName: string;

  @ApiProperty({ example: '0905123456' })
  @IsNotEmpty()
  @Matches(/^[0-9]{10}$/, { message: 'Số điện thoại phải gồm 10 chữ số' })
  tenantPhone: string;

  @ApiProperty({ example: '2026-11-25', description: 'Ngày hẹn xem phòng (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsString()
  appointmentDate: string;

  @ApiProperty({ example: '15:30', description: 'Khung giờ xem phòng' })
  @IsNotEmpty()
  @IsString()
  appointmentTime: string;

  @ApiPropertyOptional({ example: 'sinhvien@svtro.vn' })
  @IsOptional()
  @IsString()
  tenantEmail?: string;

  @ApiPropertyOptional({ example: 'Em muốn dẫn bạn cùng phòng qua xem chung' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: false, description: 'Đăng ký nhận báo khi có phòng trống' })
  @IsOptional()
  @IsBoolean()
  isWaitlist?: boolean;
}
