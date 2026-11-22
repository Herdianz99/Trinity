import { IsString, IsUrl, MaxLength } from 'class-validator';

export class PushSubscribeDto {
  @IsUrl({ require_tld: false, protocols: ['https'] })
  @MaxLength(1000)
  endpoint!: string;

  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

export class PushUnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}
