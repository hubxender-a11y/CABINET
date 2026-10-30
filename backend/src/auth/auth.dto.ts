import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}
