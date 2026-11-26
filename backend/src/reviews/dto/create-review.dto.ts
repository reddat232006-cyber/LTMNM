import { IsNotEmpty, IsNumber, Min, Max, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ example: '673d328498...', description: 'ID của phòng trọ' })
  @IsNotEmpty()
  @IsString()
  roomId: string;

  @ApiProperty({ example: 'Nguyễn Văn Minh' })
  @IsNotEmpty()
  @IsString()
  authorName: string;

  @ApiProperty({ example: 5, description: 'Điểm đánh giá (1-5 sao)' })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Phòng sạch sẽ, cô chủ thân thiện, an ninh tốt!' })
  @IsNotEmpty()
  @IsString()
  comment: string;

  @ApiPropertyOptional({ example: false, description: 'Đánh dấu nếu đây là bài báo cáo lừa đảo' })
  @IsOptional()
  @IsBoolean()
  isScamReport?: boolean;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  reportReason?: string;
}
