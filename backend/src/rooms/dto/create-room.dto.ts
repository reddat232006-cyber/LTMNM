import { IsNotEmpty, IsNumber, IsEnum, IsArray, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomType, RoomStatus, TargetAudience } from '../schemas/room.schema';

export class CreateRoomDto {
  @ApiProperty({ example: 'Phòng trọ gác lửng kiệt Nguyễn Lương Bằng - Gần Bách Khoa & KCN Hòa Khánh' })
  @IsNotEmpty({ message: 'Tiêu đề không được để trống' })
  title: string;

  @ApiProperty({ example: 1800000, description: 'Giá thuê VNĐ/tháng' })
  @IsNumber({}, { message: 'Giá phòng phải là số' })
  @Min(500000, { message: 'Giá phòng tối thiểu 500.000 VNĐ' })
  price: number;

  @ApiProperty({ example: 22, description: 'Diện tích (m2)' })
  @IsNumber({}, { message: 'Diện tích phải là số' })
  @Min(8, { message: 'Diện tích tối thiểu 8m2' })
  area: number;

  @ApiProperty({ example: 'lien-chieu', description: 'Mã quận/huyện' })
  @IsNotEmpty()
  district: string;

  @ApiProperty({ example: 'Quận Liên Chiểu' })
  @IsNotEmpty()
  districtName: string;

  @ApiProperty({ example: 'Kiệt 54 Nguyễn Lương Bằng, P. Hòa Khánh Bắc, Q. Liên Chiểu' })
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 108.1518, description: 'Kinh độ (Longitude)' })
  @IsNumber()
  lng: number;

  @ApiProperty({ example: 16.0772, description: 'Vĩ độ (Latitude)' })
  @IsNumber()
  lat: number;

  @ApiPropertyOptional({ enum: TargetAudience, example: TargetAudience.ALL })
  @IsOptional()
  @IsEnum(TargetAudience)
  targetAudience?: TargetAudience;

  @ApiPropertyOptional({ example: 'dut', description: 'Mã trường ĐH hoặc Khu công nghiệp gần nhất' })
  @IsOptional()
  @IsString()
  nearPlaceId?: string;

  @ApiPropertyOptional({ example: 'ĐH Bách Khoa & KCN Hòa Khánh' })
  @IsOptional()
  @IsString()
  nearPlaceName?: string;

  @ApiPropertyOptional({ example: '300m' })
  @IsOptional()
  @IsString()
  distance?: string;

  @ApiProperty({ enum: RoomType, example: RoomType.PHONG_TRO })
  @IsEnum(RoomType)
  type: RoomType;

  @ApiPropertyOptional({ enum: RoomStatus, example: RoomStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  availableCount?: number;

  @ApiPropertyOptional({ example: ['may-lanh', 'gac-lung', 've-sinh-rieng', 'gio-tu-do', 'wifi'] })
  @IsOptional()
  @IsArray()
  amenities?: string[];

  @ApiPropertyOptional({ example: ['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267'] })
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiProperty({ example: '0905123456' })
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '0905123456' })
  @IsNotEmpty()
  zalo: string;

  @ApiPropertyOptional({ example: '3.000đ / kWh' })
  @IsOptional()
  @IsString()
  electricity?: string;

  @ApiPropertyOptional({ example: '50.000đ / người' })
  @IsOptional()
  @IsString()
  water?: string;

  @ApiPropertyOptional({ example: 'Phòng mới xây có gác đúc, khóa vân tay, an ninh tốt.' })
  @IsOptional()
  @IsString()
  description?: string;
}
