
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstitutesService {
    constructor(private prisma: PrismaService) { }

    // Public: Get active institutes for students
    async findAllActive() {
        return this.prisma.institutes.findMany({
            where: { is_active: true },
            select: { name: true, id: true },
            orderBy: { name: 'asc' },
        });
    }

    // Admin: Get all institutes
    async findAll() {
        return this.prisma.institutes.findMany({
            orderBy: { name: 'asc' },
        });
    }

    // Admin: Create institute
    async create(name: string) {
        return this.prisma.institutes.create({
            data: { name },
        });
    }

    // Admin: Update institute
    async update(id: string, name?: string, isActive?: boolean) {
        const institute = await this.prisma.institutes.findUnique({
            where: { id },
        });

        if (!institute) {
            throw new NotFoundException('Institute not found');
        }

        return this.prisma.institutes.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(isActive !== undefined && { is_active: isActive }),
                updated_at: new Date(),
            },
        });
    }

    // Admin: Delete institute
    async remove(id: string) {
        const institute = await this.prisma.institutes.findUnique({
            where: { id },
        });

        if (!institute) {
            throw new NotFoundException('Institute not found');
        }

        return this.prisma.institutes.delete({
            where: { id },
        });
    }
}
