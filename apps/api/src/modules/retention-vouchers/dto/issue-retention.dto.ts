import { IsDateString } from 'class-validator';

export class IssueRetentionDto {
  @IsDateString()
  issueDate: string;
}
