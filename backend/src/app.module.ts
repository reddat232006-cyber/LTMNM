import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StatsModule } from './stats/stats.module';
import { ChatModule } from './chat/chat.module';
import { AiModule } from './ai/ai.module';
import { PostsModule } from './posts/posts.module';
import { RoomRequestsModule } from './room-requests/room-requests.module';
import * as dotenv from 'dotenv';

dotenv.config();

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/phong_tro', {
      autoIndex: true, // Tự động tạo 2dsphere index cho tìm kiếm bản đồ
    }),
    UsersModule,
    AuthModule,
    RoomsModule,
    AppointmentsModule,
    ReviewsModule,
    StatsModule,
    ChatModule,
    AiModule,
    PostsModule,
    RoomRequestsModule,
  ],
})
export class AppModule {}
