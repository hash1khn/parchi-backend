import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ConfigModule } from './common/config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { OffersModule } from './modules/offers/offers.module';
import { StudentsModule } from './modules/students/students.module';
import { RedemptionsModule } from './modules/redemptions/redemptions.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InstitutesModule } from './modules/institutes/institutes.module';
import { AccountDeletionModule } from './modules/account-deletion/account-deletion.module';


@Module({
  imports: [
    // ── Rate limiting ──────────────────────────────────────────────────────
    // Global default: 100 requests per 60 seconds per IP.
    // Auth endpoints override this with a much stricter limit via @Throttle().
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60_000,   // 60-second window
        limit: 100,    // max 100 requests per window
      },
    ]),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/public',
    }),
    ConfigModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    MerchantsModule,
    OffersModule,
    StudentsModule,
    RedemptionsModule,
    AdminDashboardModule,
    MailModule,
    NotificationsModule,
    InstitutesModule,
    AccountDeletionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply ThrottlerGuard globally so every route is rate-limited by default
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
