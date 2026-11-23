import { Controller, Get, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MessagesModule } from './messages/messages.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StoreModule } from './store/memory.store';
import { UsersModule } from './users/users.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [HealthController],
  imports: [StoreModule, AuthModule, UsersModule, MessagesModule, RealtimeModule],
})
export class AppModule {}
