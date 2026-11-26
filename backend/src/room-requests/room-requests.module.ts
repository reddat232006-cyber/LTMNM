import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { RoomRequest, RoomRequestSchema } from './schemas/room-request.schema';
import { RoomRequestsService } from './room-requests.service';
import { RoomRequestsController } from './room-requests.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: RoomRequest.name, schema: RoomRequestSchema }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'svtro_super_secret_jwt_key_2026',
    }),
  ],
  controllers: [RoomRequestsController],
  providers: [RoomRequestsService],
})
export class RoomRequestsModule {}
