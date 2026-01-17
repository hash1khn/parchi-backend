import { Module, forwardRef } from '@nestjs/common';
import { AdminStudentsController } from './admin-students.controller';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

import { SohoStrategy } from '../redemptions/strategies/soho.strategy';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), MailModule],
  controllers: [AdminStudentsController, StudentsController],
  providers: [StudentsService, SohoStrategy],
  exports: [StudentsService],
})
export class StudentsModule { }

