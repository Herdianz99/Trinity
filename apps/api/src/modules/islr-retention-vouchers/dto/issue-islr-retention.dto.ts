import { IsDateString } from 'class-validator';

export class IssueIslrRetentionDto {
  @IsDateString()
  issueDate: string;
}
