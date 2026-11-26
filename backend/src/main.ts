import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Tự động tạo thư mục uploads và phục vụ ảnh tĩnh qua /uploads/*
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // Cho phép CORS để Frontend có thể gọi API từ bất kỳ port nào (vd 3000, 5500)
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Tiền tố toàn cục cho toàn bộ API
  app.setGlobalPrefix('api');

  // Tự động kiểm tra và validate DTO đầu vào
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Cấu hình tài liệu Swagger UI tự động
  const config = new DocumentBuilder()
    .setTitle('SVTrọ API - Tìm Kiếm Phòng Trọ Sinh Viên & Người Lao Động')
    .setDescription(
      'Hệ thống API quản lý phòng trọ, tìm kiếm theo bán kính vị trí, đặt lịch xem phòng, đánh giá và xác thực người dùng.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`🚀 Server Backend NestJS đang chạy tại: http://localhost:${port}/api`);
  console.log(`📑 Tài liệu Swagger API xem tại: http://localhost:${port}/api/docs`);
}

bootstrap();
