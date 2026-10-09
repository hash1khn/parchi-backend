import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';
import { createApiResponse } from '../../utils/serializer.util';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('active')
  @HttpCode(HttpStatus.OK)
  async findActive() {
    const data = await this.eventsService.findActive();
    return createApiResponse(data, 'Active events retrieved successfully');
  }
}

@Controller('admin/events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLES.ADMIN)
export class AdminEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    const data = await this.eventsService.findAll();
    return createApiResponse(data, 'Events retrieved successfully');
  }

  @Get('ticket-sales')
  @HttpCode(HttpStatus.OK)
  async getTicketSales() {
    const data = await this.eventsService.getTicketSales();
    return createApiResponse(data, 'Ticket sales retrieved successfully');
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.eventsService.findOne(id);
    return createApiResponse(data, 'Event retrieved successfully');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateEventDto) {
    const data = await this.eventsService.create(dto);
    return createApiResponse(data, 'Event created successfully');
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const data = await this.eventsService.update(id, dto);
    return createApiResponse(data, 'Event updated successfully');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.eventsService.remove(id);
    return createApiResponse(data, 'Event deleted successfully');
  }
}
