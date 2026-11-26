import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { RoomBilling, RoomBillingSchema } from './schemas/room-billing.schema';
import { Room, RoomSchema } from '../rooms/schemas/room.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoomBilling.name, schema: RoomBillingSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'svtro_super_secret_jwt_key_2026',
    }),
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
