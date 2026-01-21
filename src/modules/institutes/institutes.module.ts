
import { Module } from '@nestjs/common';
import { InstitutesService } from './institutes.service';
import { InstitutesController, AdminInstitutesController } from './institutes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [InstitutesController, AdminInstitutesController],
    providers: [InstitutesService],
})
export class InstitutesModule { }
