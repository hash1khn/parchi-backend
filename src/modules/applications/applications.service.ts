import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const VALID_STATUSES = ['new', 'contacted', 'approved', 'rejected'];

@Injectable()
export class ApplicationsService {
    constructor(private readonly prisma: PrismaService) { }

    async getMerchantApplications(page: number = 1, limit: number = 20, status?: string) {
        const skip = (page - 1) * limit;
        const where = status ? { status } : {};

        const [data, total] = await Promise.all([
            this.prisma.merchant_applications.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.merchant_applications.count({ where }),
        ]);

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
    }

    async updateMerchantApplicationStatus(id: string, status: string) {
        if (!VALID_STATUSES.includes(status)) {
            throw new BadRequestException(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
        }

        const existing = await this.prisma.merchant_applications.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('Merchant application not found');
        }

        const application = await this.prisma.merchant_applications.update({
            where: { id },
            data: { status },
        });

        return { message: `Application marked as ${status}`, application };
    }

    async getAmbassadorApplications(page: number = 1, limit: number = 20, status?: string) {
        const skip = (page - 1) * limit;
        const where = status ? { status } : {};

        const [data, total] = await Promise.all([
            this.prisma.ambassador_applications.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.ambassador_applications.count({ where }),
        ]);

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
    }

    async updateAmbassadorApplicationStatus(id: string, status: string) {
        if (!VALID_STATUSES.includes(status)) {
            throw new BadRequestException(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
        }

        const existing = await this.prisma.ambassador_applications.findUnique({ where: { id } });
        if (!existing) {
            throw new NotFoundException('Ambassador application not found');
        }

        const application = await this.prisma.ambassador_applications.update({
            where: { id },
            data: { status },
        });

        return { message: `Application marked as ${status}`, application };
    }
}
