import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}
