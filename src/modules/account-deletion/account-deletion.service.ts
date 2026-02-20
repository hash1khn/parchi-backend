import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeletionRequestDto } from './dto/create-deletion-request.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AccountDeletionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService, // Inject MailService if we want to send confirmation
    ) { }

    async createRequest(createDto: CreateDeletionRequestDto) {
        if (!createDto.confirm) {
            throw new BadRequestException('Confirmation is required');
        }

        const request = await this.prisma.deletion_requests.create({
            data: {
                identifier: createDto.identifier,
                reason: createDto.reason,
                status: 'pending',
            },
        });

        // TODO: Send email notification to admin or user if needed.
        // For now, just logging.
        console.log(`Account deletion request created for: ${createDto.identifier}`);

        return {
            message: 'Account deletion request submitted successfully',
            requestId: request.id
        };
    }
}
