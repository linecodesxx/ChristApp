import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CallsController } from './calls.controller';
import { AgoraService } from './agora.service';

@Module({
  imports: [AuthModule],
  controllers: [CallsController],
  providers: [AgoraService],
  exports: [AgoraService],
})
export class CallsModule {}
