import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Reviews - Đánh giá & Báo cáo lừa đảo')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Đã đăng nhập] Gửi đánh giá hoặc Báo cáo lừa đảo (mỗi tài khoản 1 lần/phòng)' })
  create(
    @Body() createDto: CreateReviewDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('fullName') fullName: string,
    @CurrentUser('email') email: string,
  ) {
    return this.reviewsService.create(createDto, { userId, fullName, email });
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
