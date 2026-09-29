import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * The student app appends the student's Parchi ID to this URL, so an admin typo must
   * not send it to the wrong site. When EVENT_URL_ALLOWED_HOSTS is set (comma-separated,
   * e.g. "insidekarachi.com"), only those hosts (and their subdomains) are accepted.
   */
  private assertAllowedExternalUrl(url: string) {
    const raw = this.configService.get<string>('EVENT_URL_ALLOWED_HOSTS');
    const allowed = (raw ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length === 0) return;

    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      throw new BadRequestException('externalUrl is not a valid URL');
    }
    if (!allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
      throw new BadRequestException(`externalUrl host must be one of: ${allowed.join(', ')}`);
    }
  }

  async findActive() {
    const events = await this.prisma.events.findMany({
      where: { is_active: true },
      take: 100,
      orderBy: [{ display_order: 'asc' }, { event_date: 'asc' }, { created_at: 'desc' }],
    });
    return events.map((event) => this.formatEvent(event));
  }

  async findAll() {
    const events = await this.prisma.events.findMany({
      orderBy: [{ display_order: 'asc' }, { event_date: 'asc' }, { created_at: 'desc' }],
    });
    return events.map((event) => this.formatEvent(event));
  }

  async findOne(id: string) {
    const event = await this.prisma.events.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return this.formatEvent(event);
  }

  async create(dto: CreateEventDto) {
    this.assertAllowedExternalUrl(dto.externalUrl);
    const event = await this.prisma.events.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        image_url: dto.imageUrl ?? null,
        external_url: dto.externalUrl,
        event_date: dto.eventDate ? new Date(dto.eventDate) : null,
        venue: dto.venue ?? null,
        is_active: dto.isActive ?? true,
        display_order: dto.displayOrder ?? 0,
      },
    });
    return this.formatEvent(event);
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.findOne(id);
    if (dto.externalUrl !== undefined) this.assertAllowedExternalUrl(dto.externalUrl);

    const event = await this.prisma.events.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { image_url: dto.imageUrl }),
        ...(dto.externalUrl !== undefined && { external_url: dto.externalUrl }),
        ...(dto.eventDate !== undefined && {
          event_date: dto.eventDate ? new Date(dto.eventDate) : null,
        }),
        ...(dto.venue !== undefined && { venue: dto.venue }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        ...(dto.displayOrder !== undefined && { display_order: dto.displayOrder }),
      },
    });
    return this.formatEvent(event);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.events.delete({ where: { id } });
    return { success: true };
  }

  private formatEvent(event: {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    external_url: string;
    event_date: Date | null;
    venue: string | null;
    is_active: boolean;
    display_order: number;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      imageUrl: event.image_url,
      externalUrl: event.external_url,
      eventDate: event.event_date,
      venue: event.venue,
      isActive: event.is_active,
      displayOrder: event.display_order,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
    };
  }
}
