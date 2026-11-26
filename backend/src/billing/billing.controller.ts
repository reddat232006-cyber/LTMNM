import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Billing - Theo dõi tiền thuê & Hóa đơn')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ / Admin] Lấy dữ liệu hóa đơn & hạn thanh toán từ MongoDB' })
  findAll(@CurrentUser('sub') userId: string, @CurrentUser('role') userRole: string) {
    return this.billingService.findAllForUser(userId, userRole);
  }

  @Put(':roomId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ chính chủ / Admin] Lưu chỉ số điện nước, hạn thanh toán vào MongoDB' })
  upsert(
    @Param('roomId') roomId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: any,
  ) {
    return this.billingService.upsertForRoom(roomId, userId, userRole, body);
  }
}
