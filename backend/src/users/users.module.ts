import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { MeController } from "./me.controller";
import { UsersController } from "./users.controller";

@Module({
  imports: [RealtimeModule],
  controllers: [MeController, UsersController],
})
export class UsersModule {}
