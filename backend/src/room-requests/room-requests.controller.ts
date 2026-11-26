import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoomRequestsService } from './room-requests.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Room Requests - Đăng tin tìm phòng theo yêu cầu')
@Controller('room-requests')
export class RoomRequestsController {
  constructor(private readonly service: RoomRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tin cần tìm phòng của người thuê' })
  findAll(@Query('district') district?: string, @Query('status') status?: string) {
    return this.service.findAll(district, status);
  }

  @Post()
  @ApiOperation({ summary: 'Người thuê đăng tin tìm phòng theo yêu cầu & ngân sách' })
  create(@Body() body: any, @Req() req: any) {
    const userId = req.user?.sub || body.tenantId;
    return this.service.create(body, userId);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Thích / Quan tâm bài viết trong Group tìm phòng' })
  like(@Param('id') id: string) {
    return this.service.likeRequest(id);
  }

  @Post(':id/offers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ / Admin] Gửi đề xuất phòng phù hợp để liên hệ chốt hợp đồng' })
  addOffer(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('fullName') fullName: string,
    @Body()
    body: {
      landlordName?: string;
      landlordPhone: string;
      roomId?: string;
      roomTitle?: string;
      offerPrice?: number;
      message: string;
    },
  ) {
    return this.service.addOffer(id, {
      landlordId: userId,
      landlordName: body.landlordName || fullName || 'Chủ trọ SVTrọ',
      landlordPhone: body.landlordPhone,
      roomId: body.roomId,
      roomTitle: body.roomTitle,
      offerPrice: body.offerPrice,
      message: body.message,
    });
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Người đăng / Admin] Cập nhật trạng thái Đang tìm / Đã chốt phòng' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: { status: 'open' | 'matched' },
  ) {
    return this.service.updateStatus(id, body.status, userId, userRole);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Người đăng / Admin] Xóa tin tìm phòng' })
  remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.service.remove(id, userId, userRole);
  }
}
