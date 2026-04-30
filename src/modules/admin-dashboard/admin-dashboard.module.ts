import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsModule } from '../analytics/analytics.module';


@Module({
    imports: [PrismaModule, AuthModule, AnalyticsModule],
    controllers: [AdminDashboardController],
    providers: [AdminDashboardService],
})
export class AdminDashboardModule { }
