import { IsEmail } from 'class-validator';

export class AssignManagingPartnerDto {
  @IsEmail()
  email: string;
}
