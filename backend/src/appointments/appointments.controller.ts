import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentStatus } from './schemas/appointment.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Appointments - Đặt lịch xem phòng')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Sinh viên / Người lao động gửi yêu cầu đặt lịch hẹn xem phòng' })
  create(@Body() createDto: CreateAppointmentDto) {
    return this.appointmentsService.create(createDto);
  }

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Sinh viên / Người lao động] Xem danh sách lịch hẹn xem phòng của tôi' })
  findMy(@CurrentUser('email') email: string) {
    return this.appointmentsService.findMyAppointments(email);
  }

  @Get('room/:roomId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ / Admin] Xem danh sách lịch hẹn của một phòng' })
  findByRoom(@Param('roomId') roomId: string) {
    return this.appointmentsService.findByRoom(roomId);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ / Admin] Lấy tất cả các lịch hẹn' })
  findAll() {
    return this.appointmentsService.findAll();
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Người thuê] Tự hủy lịch hẹn xem phòng của chính mình' })
  cancelMyAppointment(
    @Param('id') id: string,
    @CurrentUser('email') email: string,
    @CurrentUser('role') role: string,
  ) {
    return this.appointmentsService.cancelMyAppointment(id, email, role);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ / Admin] Xác nhận hoặc hủy lịch hẹn' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: AppointmentStatus },
  ) {
    return this.appointmentsService.updateStatus(id, body.status);
  }
}
