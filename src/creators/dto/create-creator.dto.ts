import { IsEmail, IsNotEmpty, IsObject, IsString } from "class-validator";

export class CreateCreatorDto {
    @IsString()
    @IsNotEmpty()
    creator_name:string

    @IsString()
    @IsNotEmpty()
    company_name:string

    @IsString()
    @IsNotEmpty()
    password:string

    @IsEmail()
    @IsNotEmpty()
    email:string

    @IsString()
    @IsNotEmpty()
    country:string

    @IsString()
    @IsNotEmpty()
    state:string

    @IsString()
    @IsNotEmpty()
    phoneNum:number

    @IsString()
    @IsNotEmpty()
    account_name:string

    @IsString()
    @IsNotEmpty()
    account_number:string

    @IsString()
    @IsNotEmpty()
    bank_name:string
}
