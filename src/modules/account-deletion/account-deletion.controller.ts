import { Body, Controller, Post } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { CreateDeletionRequestDto } from './dto/create-deletion-request.dto';

@Controller('account-deletion')
export class AccountDeletionController {
    constructor(private readonly accountDeletionService: AccountDeletionService) { }

    @Post()
    async create(@Body() createDto: CreateDeletionRequestDto) {
        return this.accountDeletionService.createRequest(createDto);
    }
}
