import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface PartnerContext {
  id: string;
  partnerName: string;
}

export const CurrentPartner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PartnerContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.partner;
  },
);
