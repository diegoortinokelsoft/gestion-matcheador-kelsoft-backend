import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  user_mail!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
