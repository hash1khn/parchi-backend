import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { CreateDeletionRequestDto } from './dto/create-deletion-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@Controller('account-deletion')
export class AccountDeletionController {
    constructor(private readonly accountDeletionService: AccountDeletionService) { }

    @Post()
    async create(@Body() createDto: CreateDeletionRequestDto) {
        return this.accountDeletionService.createRequest(createDto);
    }

    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    async getAll(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
    ) {
        return this.accountDeletionService.getAllRequests(
            page ? parseInt(page, 10) : 1,
            limit ? parseInt(limit, 10) : 20,
            status,
        );
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    async processRequest(
        @Param('id') id: string,
        @Body('action') action: 'approve' | 'reject',
    ) {
        return this.accountDeletionService.processRequest(id, action);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    async deleteRequest(@Param('id') id: string) {
        return this.accountDeletionService.deleteRequest(id);
    }
}
