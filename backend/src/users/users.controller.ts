import { Controller, Get, Patch, Body, UseGuards, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from './schemas/user.schema';

@ApiTags('Users - Quản lý tài khoản')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Cập nhật thông tin cá nhân' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() updateData: { fullName?: string; phone?: string; avatar?: string },
  ) {
    return this.usersService.updateProfile(userId, updateData);
  }

  @Patch('me/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Đổi mật khẩu bảo mật cho tài khoản đang đăng nhập' })
  async changePassword(
    @CurrentUser('sub') userId: string,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changePassword(userId, body.currentPassword, body.newPassword);
  }

  @Get('me/login-history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Xem nhật ký đăng nhập gần đây của tài khoản đang đăng nhập' })
  async getLoginHistory(@CurrentUser('sub') userId: string) {
    return this.usersService.getLoginHistory(userId);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Lấy danh sách toàn bộ người dùng' })
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Lấy danh sách yêu cầu đăng ký tài khoản đang chờ duyệt' })
  async getPendingUsers() {
    return this.usersService.getPendingUsers();
  }

  @Patch(':id/approve')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Phê duyệt yêu cầu đăng ký tài khoản' })
  async approveUser(@Param('id') id: string) {
    return this.usersService.approveUser(id);
  }

  @Patch(':id/reject')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Từ chối yêu cầu đăng ký tài khoản' })
  async rejectUser(@Param('id') id: string) {
    return this.usersService.rejectUser(id);
  }

  @Patch(':id/role')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Thay đổi vai trò phân quyền của tài khoản' })
  async updateUserRole(@Param('id') id: string, @Body() body: { role: UserRole }) {
    return this.usersService.updateUserRole(id, body.role);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Khóa hoặc mở khóa tài khoản người dùng' })
  async toggleUserActive(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.usersService.toggleUserActive(id, body.isActive);
  }
}
