import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeletionRequestDto } from './dto/create-deletion-request.dto';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class AccountDeletionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
        private readonly authService: AuthService,
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

        console.log(`Account deletion request created for: ${createDto.identifier}`);

        return {
            message: 'Account deletion request submitted successfully',
            requestId: request.id,
        };
    }

    async getAllRequests(page: number = 1, limit: number = 20, status?: string) {
        const skip = (page - 1) * limit;

        const where = status ? { status } : {};

        const [requests, total] = await Promise.all([
            this.prisma.deletion_requests.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.deletion_requests.count({ where }),
        ]);

        return {
            data: requests,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async processRequest(id: string, action: 'approve' | 'reject') {
        const request = await this.prisma.deletion_requests.findUnique({ where: { id } });

        if (!request) {
            throw new NotFoundException('Deletion request not found');
        }

        if (request.status !== 'pending') {
            throw new BadRequestException(`Request is already ${request.status}`);
        }

        if (action === 'approve') {
            // Actually delete the user — cascades through all tables
            // auth.users → public.users → students → redemptions, kyc, stats, etc.
            const { email, firstName } = await this.authService.deleteUserByIdentifier(request.identifier);

            // Mark the request itself as approved (for audit trail)
            const updated = await this.prisma.deletion_requests.update({
                where: { id },
                data: { status: 'approved', updated_at: new Date() },
            });

            // Send confirmation email to the user (fire-and-forget — don't block on email failure)
            this.mailService
                .sendAccountDeletionConfirmationEmail(email, firstName)
                .catch((err) =>
                    console.error(`Failed to send deletion confirmation email to ${email}:`, err),
                );

            console.log(`Account for ${request.identifier} has been permanently deleted (request: ${id})`);

            return {
                message: 'Account has been permanently deleted and all associated data removed',
                request: updated,
            };
        }

        // action === 'reject': just update status, no deletion
        const updated = await this.prisma.deletion_requests.update({
            where: { id },
            data: { status: 'rejected', updated_at: new Date() },
        });

        console.log(`Deletion request ${id} for ${request.identifier} has been rejected`);

        return {
            message: 'Deletion request has been rejected — account remains active',
            request: updated,
        };
    }

    async deleteRequest(id: string) {
        const request = await this.prisma.deletion_requests.findUnique({ where: { id } });

        if (!request) {
            throw new NotFoundException('Deletion request not found');
        }

        await this.prisma.deletion_requests.delete({ where: { id } });

        return {
            message: 'Deletion request removed successfully',
        };
    }
}
