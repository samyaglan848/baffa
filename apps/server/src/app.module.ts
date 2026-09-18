import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RoomService } from './modules/room/room.service';
import { BotService } from './modules/game/bot.service';
import { GameSessionService } from './modules/game/game-session.service';
import { MatchService } from './modules/match/match.service';
import { MatchController } from './modules/match/match.controller';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { VoiceService } from './modules/voice/voice.service';
import { AnticheatService } from './modules/anticheat/anticheat.service';
import { VerificationService } from './modules/auth/verification.service';
import { GameGateway } from './gateways/game.gateway';
import { ProfileService } from './modules/profile/profile.service';
import { ProfileController } from './modules/profile/profile.controller';
import { LocalProfileStorage } from './modules/profile/storage/local-profile-storage';

import { PersistenceModule } from './modules/persistence/persistence.module';
import { PersistenceService } from './modules/persistence/persistence.service';

@Module({
  imports: [PersistenceModule],
  controllers: [MatchController, AuthController, ProfileController],
  providers: [
    PrismaService,
    VerificationService,
    AuthService,
    LocalProfileStorage,
    ProfileService,
    VoiceService,
    AnticheatService,
    RoomService,
    BotService,
    GameSessionService,
    MatchService,
    GameGateway,
  ],
})
export class AppModule {}
