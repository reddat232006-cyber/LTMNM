import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RoomType, RoomStatus, TargetAudience } from '../schemas/room.schema';

export class QueryRoomDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm (tên đường, tiện ích, mô tả)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: 'Quận/Huyện tại Đà Nẵng' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ enum: TargetAudience, description: 'Đối tượng: student (sinh viên), worker (người lao động)' })
  @IsOptional()
  @IsEnum(TargetAudience)
  targetAudience?: TargetAudience;

  @ApiPropertyOptional({ description: 'Mã trường ĐH hoặc Khu công nghiệp (vd: dut, kcn-hoa-khanh)' })
  @IsOptional()
  @IsString()
  nearPlaceId?: string;

  @ApiPropertyOptional({ description: 'Giá thấp nhất (VNĐ)' })
  @IsOptional()
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Giá cao nhất (VNĐ)' })
  @IsOptional()
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType;

  @ApiPropertyOptional({ enum: RoomStatus })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional({ description: 'Tiện ích (phân cách bởi dấu phẩy, vd: may-lanh,gac-lung)' })
  @IsOptional()
  @IsString()
  amenities?: string;

  // Tọa độ GPS tìm kiếm xung quanh vị trí
  @ApiPropertyOptional({ description: 'Vĩ độ (Latitude) để tìm phòng xung quanh' })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ description: 'Kinh độ (Longitude) để tìm phòng xung quanh' })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ description: 'Bán kính tìm kiếm tính theo Km (Mặc định 5km)' })
  @IsOptional()
  @IsNumber()
  radiusInKm?: number;
}
