import { Module } from '@nestjs/common';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [PrismaModule, MailModule, AuthModule],
    controllers: [AccountDeletionController],
    providers: [AccountDeletionService],
})
export class AccountDeletionModule { }
