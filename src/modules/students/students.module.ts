import { Module } from '@nestjs/common';
import { AdminStudentsController } from './admin-students.controller';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminStudentsController, StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}

