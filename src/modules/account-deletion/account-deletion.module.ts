import { Module } from '@nestjs/common';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [PrismaModule, MailModule],
    controllers: [AccountDeletionController],
    providers: [AccountDeletionService],
})
export class AccountDeletionModule { }
