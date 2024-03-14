import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginCreatorDto {
    @IsEmail()
    @IsNotEmpty()
    email:string

    @IsString()
    @IsNotEmpty()
    password:string
    
}
