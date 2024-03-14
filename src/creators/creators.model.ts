import * as mongoose from "mongoose"

const Schema = mongoose.Schema

export const creatorSchema = new Schema({
    creator_name: { type: String, required:true},
    company_name:{type: String},
    password: { type: String, unique: true, required:true},
    email:{type:String,required:true},
    country:{type:String},
    state:{type:String},
    profileImage:{type:Object},
    phoneNum:{type:String},
    verified:{type:Boolean, default:false},
    passwordResetToken:{type:String},
    passwordResetExpireDate:{type:Date},
    freePlan:{type:Boolean, default:true},
    paidPlan:{type:Boolean, default:false},
    paymentStatus:{type:String, default:"pending", enum:["pending", "failed", "successful"]},
    account_name:{type:String},
    account_number:{type:String},
    bank_name:{type:String},
    creationDate:{type:Date},
    walletId:{type:Schema.Types.ObjectId, ref:"Wallet"},
    eventsId:[{type:Schema.Types.ObjectId, ref:"events"}],
    allScannedEventeesId:[{type:Schema.Types.ObjectId, ref:"Eventee"}],
    allTicketedEventeesId:[{type:Schema.Types.ObjectId, ref:"Eventee"}],
})

mongoose.model("creators", creatorSchema)

export interface Creator extends mongoose.Document{
    id:string
    creator_name:string
    company_name:string
    password:string
    email:string
    country:string
    state:string
    profileImage:Object,
    phoneNum:string
    paymentStatus:string
    account_name:string
    account_number:string
    bank_name:string
    verified:boolean
    passwordResetToken:string
    passwordResetExpireDate:Date
    freePlan:boolean
    paidPlan:boolean
    creationDate:Date
    eventsId:object[]
    walletId:object
    allScannedEventeesId:string[]
    allTicketedEventeesId:string[]
}