import { IsNotEmpty, IsObject, IsString, IsNumber, IsEmpty } from "class-validator"

export class CreateEventeeDto {
    @IsString()
    @IsNotEmpty()
    first_name:string

    @IsString()
    @IsNotEmpty()
    last_name:string

    @IsString()
    @IsNotEmpty()
    password:string

    @IsString()
    @IsNotEmpty()
    email:string

    @IsEmpty()
    eventeeReminder_days:any

    @IsString()
    @IsNotEmpty()
    sex:string

    @IsString()
    @IsNotEmpty()
    country:string

    @IsString()
    @IsNotEmpty()
    state:string

    @IsString()
    @IsNotEmpty()
    phoneNum:string

    profileImage:any
}
