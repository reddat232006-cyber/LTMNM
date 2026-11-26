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
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';
import { RoomStatus } from './schemas/room.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Rooms - Phòng trọ & Tìm kiếm')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('places')
  @ApiOperation({ summary: 'Lấy danh mục các Quận, Trường ĐH và Khu Công Nghiệp tại Đà Nẵng' })
  getPlaces() {
    return this.roomsService.getPlaces();
  }

  @Get('my-rooms')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách phòng do tài khoản hiện tại đăng (Admin xem tất cả)' })
  findMyRooms(@CurrentUser('sub') userId: string, @CurrentUser('role') userRole: string) {
    return this.roomsService.findMyRooms(userId, userRole);
  }

  @Post('upload')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Upload tối đa 5 ảnh phòng trọ thật từ máy tính' })
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname) || '.jpg';
          cb(null, `room-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Chỉ chấp nhận file ảnh (jpg, jpeg, png, webp)!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB / ảnh
    }),
  )
  uploadImages(@UploadedFiles() files: any[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 ảnh để tải lên');
    }
    const port = process.env.PORT || 5000;
    const urls = files.map((f) => `http://localhost:${port}/uploads/${f.filename}`);
    return { message: 'Upload ảnh thành công', urls };
  }

  @Get()
  @ApiOperation({ summary: 'Tìm kiếm phòng trọ với bộ lọc đa tiêu chí (giá, vị trí, KCN, ĐH, bán kính)' })
  findAll(@Query() query: QueryRoomDto) {
    return this.roomsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin chi tiết một phòng trọ' })
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chỉ Chủ trọ / Admin] Đăng tin phòng trọ mới vào MongoDB' })
  create(@Body() createRoomDto: CreateRoomDto, @CurrentUser('sub') userId: string) {
    return this.roomsService.create(createRoomDto, userId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ chính chủ / Admin] Chỉnh sửa thông tin phòng trọ' })
  update(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Body()
    body: {
      title?: string;
      price?: number;
      area?: number;
      address?: string;
      electricity?: string;
      estimatedKwh?: number;
      water?: string;
      description?: string;
      status?: RoomStatus;
      availableCount?: number;
    },
  ) {
    return this.roomsService.update(id, body, userId, userRole);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LANDLORD, UserRole.ADMIN)
  @ApiOperation({ summary: '[Chủ trọ chính chủ / Admin] Cập nhật trạng thái Còn/Hết phòng' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
    @Body() body: { status: RoomStatus; availableCount?: number },
  ) {
    return this.roomsService.updateStatus(id, body.status, body.availableCount, userId, userRole);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.LANDLORD)
  @ApiOperation({ summary: '[Admin / Chủ trọ chính chủ] Xóa bài đăng phòng trọ' })
  remove(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    return this.roomsService.remove(id, userId, userRole);
  }
}
