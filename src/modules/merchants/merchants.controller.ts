import {
  Patch,
  Param,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { MerchantsService } from './merchants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ROLES } from '../../constants/app.constants';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get('corporate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getAllCorporateMerchants() {
    return this.merchantsService.getAllCorporateMerchants();
  }
  @Get(':id/branches')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.ADMIN, ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async getMerchantBranches(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.merchantsService.getMerchantBranches(id, user);
  }

  @Patch('branches/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLES.MERCHANT_CORPORATE)
  @HttpCode(HttpStatus.OK)
  async updateBranch(
    @Param('id') id: string,
    @Body() updateBranchDto: UpdateBranchDto,
    @CurrentUser() user: any,
  ) {
    return this.merchantsService.updateBranchByCorporate(
      id,
      updateBranchDto,
      user,
    );
  }
}


