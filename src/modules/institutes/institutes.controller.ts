
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { InstitutesService } from './institutes.service';

@Controller('institutes')
export class InstitutesController {
    constructor(private readonly institutesService: InstitutesService) { }

    @Get()
    findAllActive() {
        return this.institutesService.findAllActive();
    }
}

@Controller('admin/institutes')
export class AdminInstitutesController {
    constructor(private readonly institutesService: InstitutesService) { }

    @Get()
    findAll() {
        return this.institutesService.findAll();
    }

    @Post()
    create(@Body('name') name: string) {
        return this.institutesService.create(name);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body('name') name?: string,
        @Body('isActive') isActive?: boolean,
    ) {
        return this.institutesService.update(id, name, isActive);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.institutesService.remove(id);
    }
}
