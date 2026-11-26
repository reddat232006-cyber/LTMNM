import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Reviews - Đánh giá & Báo cáo lừa đảo')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Gửi đánh giá hoặc Báo cáo lừa đảo cho một phòng trọ' })
  create(@Body() createDto: CreateReviewDto) {
    return this.reviewsService.create(createDto);
  }

  @Get('room/:roomId')
  @ApiOperation({ summary: 'Lấy toàn bộ đánh giá của một phòng trọ' })
  findByRoom(@Param('roomId') roomId: string) {
    return this.reviewsService.findByRoom(roomId);
  }

  @Get('scams')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Lấy danh sách các tin bị người dùng báo cáo lừa đảo' })
  findScamReports() {
    return this.reviewsService.findScamReports();
  }
}
