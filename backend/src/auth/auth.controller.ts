import { Controller, Post, Body, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth - Đăng ký & Đăng nhập')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản (Khách thuê hoặc Chủ trọ)' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công và nhận Token' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống (Tự động ghi nhật ký đăng nhập)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công và nhận Token' })
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    const ip =
      (req?.headers?.['x-forwarded-for'] as string) ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      '127.0.0.1';
    const userAgent = (req?.headers?.['user-agent'] as string) || 'Web Browser';
    return this.authService.login(loginDto, { ip, userAgent });
  }
}
