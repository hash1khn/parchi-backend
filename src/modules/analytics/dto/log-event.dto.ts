import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';

export enum AnalyticsPlatform {
  IOS = 'iOS',
  ANDROID = 'Android',
  WEB = 'Web',
}

export class LogEventDto {
  @IsString()
  eventName: string;

  @IsOptional()
  @IsEnum(AnalyticsPlatform)
  platform?: AnalyticsPlatform;

  @IsOptional()
  @IsObject()
  metadata?: any;
}
