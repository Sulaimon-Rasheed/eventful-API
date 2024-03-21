import {
  ConflictException,
  Injectable,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { CreateEventeeDto } from './dto/create-eventee.dto';
import { UpdateEventeeDto } from './dto/update-eventee.dto';
import { v2 } from 'cloudinary';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Eventee } from './eventees.model';
import * as encoding from 'Utils/bcrypt';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { EventeeVerification } from './verifiedEventee.model';
import { MailerService } from 'src/mailer/mailer.service';
dotenv.config();
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { LoginEventeeDto } from './dto/login-eventee.dto';
import { Event } from '../events/events.model';
import { Transaction } from '../transactions/transactions.model';
import axios from 'axios';
import * as qrcode from 'qrcode';
import { CacheService } from 'src/cache/cache.service';
import { emailVerificationDto } from './dto/emailVerification.dto';
import { newEpasswordDto } from './dto/newEpassword.dto';
import { DateTime } from 'luxon';
import { Creator } from 'src/creators/creators.model';
import { CurrencyService } from '../exchanger/currencyExchange.service';
import { Wallet } from '../wallets/wallets.model';

@Injectable()
export class EventeesService {
  constructor(
    @InjectModel('Eventee') private readonly eventeeModel: Model<Eventee>,
    @InjectModel('EventeeVerification')
    private readonly eventeeVerificationModel: Model<EventeeVerification>,
    @InjectModel('Event') private readonly eventModel: Model<Event>,
    @InjectModel('Creator') private readonly creatorModel: Model<Creator>,
    @InjectModel('Wallet') private readonly walletModel: Model<Wallet>,
    @InjectModel('Transaction')
    private readonly transactionModel: Model<Transaction>,
    private readonly mailservice: MailerService,
    private readonly Authservice: AuthService,
    private readonly cacheService: CacheService,
    private readonly currencyService :CurrencyService ,
  ) {
    v2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  //-----------------------------------Eventee Creation------------------------------------------------

  async createEventee(
    createEventeeDto: CreateEventeeDto,
    profileImage:Express.Multer.File,
    req:any,
    res: Response,
  ) {
    try {
      const existingEventee: object = await this.eventeeModel.findOne({
        email: createEventeeDto.email,
      });
      if (existingEventee) {
        throw new ConflictException("User already exist.")
      }

      const password = await encoding.encodePassword(createEventeeDto.password);
      
      const result = await v2.uploader.upload(profileImage.path, {
        folder: 'eventful_eventees_ProfileImage',
      });

      if (!result) {
        return res.json({
          statusCode:400,
          message:"Opps! file upload failed"
        })
      }

      const newEventee = await this.eventeeModel.create({
        first_name: createEventeeDto.first_name,
        last_name: createEventeeDto.last_name,
        email: createEventeeDto.email,
        sex: createEventeeDto.sex,
        phoneNum: createEventeeDto.phoneNum,
        country: createEventeeDto.country,
        state: createEventeeDto.state,
        profileImage: result,
        password: password,
      });

      fs.unlink(profileImage.path, (err) => {
        if (err) {
          throw new Error('file unlink failed');
        }
      });

      const currUrl = 'https://eventful-api-ky65.onrender.com';
      let uniqueString = newEventee._id + uuidv4();
      const hashedUniqueString = await encoding.encodePassword(uniqueString);

      await this.eventeeVerificationModel.create({
        eventeeId: newEventee._id,
        uniqueString: hashedUniqueString,
        creation_date: Date.now(),
        expiring_date: Date.now() + 21600000,
      });

      await this.mailservice.sendVerificationEmail({
        email: createEventeeDto.email,
        subject: 'Verify your email',
        html: `<div style = "background-color:lightgrey; padding:16px"; border-radius:20px>
          <p>Hi, ${createEventeeDto.first_name}</P>
          <p>Thank you for opening account with Eventful.</p>
          <p>We need to confirm it is you before being authorized to login to your account</P>
              <p>Click <a href=${
                currUrl +
                '/eventees/verify/' +
                newEventee._id +
                '/' +
                uniqueString
              }>here</a> to get authorized</P>
              <p>This link <b>will expire in the next 6hrs</b></p>
              <p>With <b>Eventful</b>, You are assured of passport to a world of unforgettable moments.</P>
              <p>Click this link: <a href=${
                currUrl +
                '/eventees/verify/' +
                newEventee._id +
                '/' +
                uniqueString
              } >${currUrl + '/eventees/verify/' + newEventee._id + '/' + uniqueString}<a/></p>
              </div>`,
      });

      return res.json({
        statusCode:200,
        message:"Successful signup. Check your email for verification link."
      })

    } catch (err) {
      throw new Error(err.message)
    }
  }


  getSignUpPage(req:any, res:Response) {
    let currUrl = "https://eventful-api-ky65.onrender.com"
    try{
      return res.json({
        statusCode:200,
        page:"Sign Up page",
        signupUrl:`${currUrl}/eventees/signup`
      })
      } catch (err) {
        throw new Error(err.message)
      }
    }

 
    getPasswordResetPage(res: Response) {
      let currUrl = "https://eventful-api-ky65.onrender.com"
      try{
        return res.json({
          statusCode:200,
          page:"Password Reset page",
          emailAuthenticationUrl:`${currUrl}/eventees/verifyEmailForPasswordReset`
        })
    }catch(err){
      throw new Error(err.message)
    }
    }

  //-------------------------------- Verifying the eventee email verification link----------------------------------------------------
  async verifyEventee(userId: string, uniqueString: string, res: Response) {
    try {
      let user = await this.eventeeVerificationModel.findOne({
        eventeeId: userId,
      });

      if (!user) {
        return res.json({
          statusCode:404,
          message:"Opps!! user not found."
        })
      }

      if (user.expiring_date.getTime() < Date.now()) {
        await this.eventeeVerificationModel.deleteOne({ eventeeId: userId });
        await this.eventeeModel.deleteOne({ _id: userId });
      }

      const valid = await encoding.validateEncodedString(
        uniqueString,
        user.uniqueString,
      );
      if (!valid) {
        return res.json({
          statusCode:400,
          error:"Bad request",
          message:"Opps!! It seems you have altered your verification link.Try again"
        })
      }

      await this.eventeeModel.findByIdAndUpdate(
        { _id: userId },
        { verified: true },
      );
      await this.eventeeVerificationModel.deleteOne({ eventeeId: userId });
      return res.json({
        statusCode:200,
        message:"Successful Verification"
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  //---------------------------------------Getting login page---------------------------------------------
  getLoginPage() {
    return `eventeeLogin_page`;
  }

  async login(LoginEventeeDto: LoginEventeeDto, res: Response) {
    try {
      const { email, password } = LoginEventeeDto;
      let user = await this.eventeeModel.findOne({ email });

      if (!user) {
        return res.json({
          statusCode:404,
          message:`Opps!! User not found`
        })
      }

      if (!user.verified) {
        return res.json({
          statusCode:400,
          message:`Opps!! You are not yet verified. Check your email for verification link`
        })
      }

      const valid = await encoding.validateEncodedString(
        password,
        user.password,
      );

      if (!valid) {
        return res.json({
          statusCode:401,
          message:`Opps!! email or password is incorrect.`
        })
      }

      const token: string = this.Authservice.generateJwtToken(
        user._id,
        user.email,
        user.first_name,
        user.profileImage,
        res,
      );

      res.cookie('jwt', token, { maxAge: 60 * 60 * 1000 });
      return res.json({
        statusCode:200,
        message:"Successful login",
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }


  //---------------------------------Verifying the email for password reset.-----------------------------------------
  async verifyEmailForPasswordReset(
    emailVerifyDto: emailVerificationDto,
    req: Request,
    res: Response,
  ) {
    try {
      const eventee: Eventee = await this.eventeeModel.findOne({
        email: emailVerifyDto.email,
      });
      if (!eventee) {
        return res.json({
          statusCode:404,
          message:"Opps!! User not found"
        })
      }

      const resetToken = uuidv4();
      const hashedResetToken = await encoding.encodePassword(resetToken);
      eventee.passwordResetToken = hashedResetToken;
      eventee.passwordResetExpireDate = Date.now() + 10 * 60 * 1000;
      eventee.save();
      const currUrl = 'https://eventful-api-ky65.onrender.com';
      this.mailservice.sendVerificationEmail({
        email: eventee.email,
        subject: 'We received your request for password reset',
        html: `<div style = "background-color:lightgrey; padding:16px"; border-radius:20px>
      <p>Hi, ${eventee.first_name}</P>
      <p>Click the link below to reset your paasword.</P>
      <p><a href= ${currUrl + '/eventees/resetPassword/newPassword/' + resetToken + '/' + eventee.email}>
      ${currUrl + '/eventees/resetPassword/newPassword/' + resetToken + '/' + eventee.email}
      </a>
      </P>
      <p>This link <b>will expire in the next 10min</b></P>
      </div>`,
      });
      return res.json({
        message:"Successful password reset request. check your email for verification link"
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  //----------------------------------Verifying Password reset Link---------------------------------------------------
  async verifyUserPasswordResetLink(
    resetToken: string,
    email: string,
    res: Response,
  ) {
    try {
      const user = await this.eventeeModel.findOne({ email: email });
      if (!user) {
        return res.render('error', { message: 'eventeeNotFound' });
      }

      if (user.passwordResetExpireDate > Date.now()) {
        return res.render('error', { message: 'expiredPasswordResetLink' });
      }

      const valid = await encoding.validateEncodedString(
        resetToken,
        user.passwordResetToken,
      );
      if (!valid) {
        res.render('error', { message: 'invalidResetToken' });
      }

      user.passwordResetToken = undefined;
      user.passwordResetExpireDate = undefined;
      user.save();

      return res.json({
        statusCode:200,
        message:"Successful verification",
        passwordResetUrl:`/eventees/newPassword/${user._id}`
      })
    } catch (err) {
      throw new Error("Invalid reset Token")
    }
  }

  //-----------------------------------Setting new password---------------------------------------------------------
  async setNewPassword(
    newPasswordDto: newEpasswordDto,
    userId: string,
    res: Response,
  ) {
    const user = await this.eventeeModel.findOne({ _id: userId });
    if (!user) {
      return res.json({
        statusCode:404,
        message:`Opps!! User not found`
      })
    }

    const newPassword = newPasswordDto.newPassword;
    console.log(newPassword);
    const hashedPassword = await encoding.encodePassword(newPassword);
    console.log(hashedPassword);
    user.password = hashedPassword;
    user.save();
    return res.json({
      statusCode:200,
      message:"Successful password reset. You can now login with your new password."
    })
  }

  //----------------------------------------Getting Eventee dashboard---------------------------------------------------------
  async getDashboard(req: Request, res: Response, page: any) {
    try {
      await this.Authservice.ensureLogin(req, res);

      let stringifyPage:any = req.query.page || 0 
      let page = parseInt(stringifyPage)
     
          const theEvents = await this.cacheService.get(
            `eventeeDashBoard_${res.locals.user.id}_${page}`,
          );

          if (!theEvents) {
            const eventPerPage: number = 10;

            const postedEvents = await this.eventModel
              .find({ state: 'Posted' })
              .sort({ created_date: 'desc' })
              .skip(page * eventPerPage)
              .limit(eventPerPage)
              .populate('creatorId');

            if (!postedEvents) {
              return [];
            }

            let theEvents = []
            for(const event of postedEvents){
              let postDate = event.posted_date;
              let parsedDate = DateTime.fromFormat(
                postDate,
                "LLL d, yyyy",
              );
              let currentDate = DateTime.now();
              let pastDay = currentDate.diff(parsedDate, 'days').toObject().days
              
              let theDay;
              if( pastDay >=0 && pastDay< 0.5){
                theDay = "today"
              }else if(pastDay >=0.5 && pastDay < 1.5){
                theDay = "yesterday"
              }else if(pastDay > 30){
                theDay = `${Math.floor((pastDay)/30)} month(s) ago`
              }else if(pastDay > 365){
                theDay = `${Math.floor((pastDay)/365)} year(s) ago`
              }else{
                theDay = `${Math.round(pastDay)} days`
              }

              const neededInfo = {
                posted:theDay,
                title:event.title,
                eventImage:event.event_image,
                time:`${event.starting_time} - ${event.ending_time}`,
                venue:event.venue,
                creator:event.creatorId,
                shareEventUrl:`http://localhost:9000/events/thisEvent/${event._id}`
                
              }

              theEvents.push(neededInfo)
            }

            await this.cacheService.set(
              `eventeeDashBoard_${res.locals.user.id}_${page}`,
              theEvents,
            );
            
            return res.json({
              statusCode:200,
              message:`Welcome ${res.locals.user.name}` ,
              profileImage:`${res.locals.user.image.url}`,
              posted_events: theEvents,
            })
            
          }

          return res.json({
            statusCode:200,
            message:`Welcome ${res.locals.user.name}` ,
            profileImage:`${res.locals.user.image.url}`,
            posted_events: theEvents,
          })
      
    } catch (err) {
      throw new Error(err.message)
    }
  }


//-----------------------Filtering the events by categories-----------------------

  async filterEvent(req:Request, res:Response, category:string){
    try{
      await this.Authservice.ensureLogin(req, res)

     
      const category:any = req.query.category || "All"

      let stringifyPage:any = req.query.page || 0 
      let page = parseInt(stringifyPage)
     
          const theEvents = await this.cacheService.get(
            `eventeeFilterdDashBoard_${res.locals.user.id}_${category}`,
          );

     if(!theEvents){
      const eventPerPage: number = 10;
      
      let postedEvents:any
      if(category == "All"){
        postedEvents = await this.eventModel
        .find({ state: 'Posted'})
        .sort({ created_date: 'desc' })
        .skip(page * eventPerPage)
        .limit(eventPerPage)
        .populate('creatorId');
      }else{
        postedEvents = await this.eventModel
        .find({ state: 'Posted', category:category })
        .sort({ created_date: 'desc' })
        .skip(page * eventPerPage)
        .limit(eventPerPage)
        .populate('creatorId');
      }
      

      if (!postedEvents) {
        return [];
      }

    
      let theEvents = []
      for(const event of postedEvents){
        let postDate = event.posted_date;
        let parsedDate = DateTime.fromFormat(
          postDate,
          "LLL d, yyyy",
        );
        let currentDate = DateTime.now();
        const pastDay = currentDate.diff(parsedDate, 'days').toObject().days

        const neededInfo = {
          posted:`${pastDay} ago`,
          title:event.title,
          eventImage:event.event_image,
          time:`${event.starting_time} - ${event.ending_time}`,
          venue:event.venue,
          creator:event.creatorId,
          ReadEventUrl:`https://eventful-api-ky65.onrender.com/events/thisEvent/${event._id}`
          
        }

        theEvents.push(neededInfo)
      }

      await this.cacheService.set(
        `eventeeFilterdDashBoard_${res.locals.user.id}_${category}`,
        theEvents,
      );

      return res.json({
        statusCode:200,
        message:`Welcome ${res.locals.user.name} o your dasboard` ,
        profileImage:`${res.locals.user.image.url}`,
        posted_events: theEvents,
      })
    
      
     }
     
     return res.json({
      statusCode:200,
      message:`Welcome ${res.locals.user.name} to your dashboard` ,
      profileImage:`${res.locals.user.image.url}`,
      posted_events: theEvents,
    })

    }catch(err){
      return res.render('catchError', { catchError: err.message });
    }
  }

//--------------------------Searching for event by Title------------------------
  async searchForTitle(req:Request, res:Response, title:string){
    try{
      await this.Authservice.ensureLogin(req,res)
      const lowerCaseTitle = req.query.title.toString()
      const upperCaseTittle = lowerCaseTitle.toUpperCase()

      let neededInfo = await this.cacheService.get(`searchedTitle_${res.locals.user.id}_${upperCaseTittle}`)

        if(!neededInfo){
         

        const event = await this.eventModel.findOne({state:"Posted", title:upperCaseTittle}).populate("creatorId")

        if(!event){
         throw new Error("Event not found")
        }

        let postDate = event.posted_date
        let parsedDate = DateTime.fromFormat(
          postDate,
          "LLL d, yyyy",
        );
        let currentDate = DateTime.now();

        const pastDay = currentDate.diff(parsedDate, 'days').toObject().days

        const neededInfo = {
          posted:`${pastDay} ago`,
          title:event.title,
          eventImage:event.event_image,
          time:`${event.starting_time} - ${event.ending_time}`,
          venue:event.venue,
          creator:event.creatorId,
          ReadEventUrl:`https://eventful-api-ky65.onrender.com/events/thisEvent/${event._id}`
          
        }

        await this.cacheService.set(`searchedTitle_${res.locals.user.id}_${upperCaseTittle}`, neededInfo)

        return res.json({
          statusCode:200,
          message:`Welcome ${res.locals.user.name}` ,
          posted_event:neededInfo,
        })
        
      }

     return res.json({
      statusCode:200,
      message:`Welcome ${res.locals.user.name}` ,
      posted_event:neededInfo,
     })
      
      
    }catch(err){
      throw new Error(err.message)
    }
   
    
  }


  //------------------------------------Initializing transaction to buy ticket-----------------------------------------
  
  async buyTicket(eventId: string, price: number, req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);

      const event = await this.eventModel.findOne({_id:eventId})
      if(!event){
        throw new NotFoundException("Event not found")
      }

      let regDeadline = DateTime.fromFormat(event.registration_deadline, "LLL d, yyyy")
      let currentDate = DateTime.now();
      let difference = currentDate.diff(regDeadline, 'days').toObject().days
      
      if(difference > 0){
        return res.json({
          statusCode:401,
          message:"Opps!! This ticket purchase has expired"
        })
      }

      const eventee = await this.eventeeModel.findOne({
        _id: res.locals.user.id,
      });

      let NairaPerDollar = await this.currencyService.getExchangeRate(res)
      let thePriceInNaira = await this.currencyService.convertDollarToNaira(price , NairaPerDollar ) 

      const transaction = await this.transactionModel.create({
        amount: `${price}`,
        eventId: eventId,
        eventeeId: eventee._id,
      });

      const data = {
        amount: thePriceInNaira * 100,
        email: eventee.email,
        reference: transaction._id,
      };

      console.log(data)

      const headers = {
        Authorization: `Bearer ${process.env.PAYSTACK_KEY}`,
      };

      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        data,
        { headers },
      ).then((response)=>{
        return res.json({
          transactionUrl:response.data.data.authorization_url
        })
    })
      .catch(err=>{
        return res.json({
          error:JSON.stringify(err)
        })
      });

      
    } catch (err) {
      throw new Error(err.message)
    }
  }

  //-------------------------------Paystack call back after successful or failed transaction----------------------------------------
  async processPaystackCallBack(req: Request, res: Response) {
    try {
      const body = req.body;
      let transaction = await this.transactionModel
        .findOne({ _id: body.data.reference })
        .populate('eventeeId')
        .populate('eventId');

      if (!transaction) {
        res.send('Transaction is not found');
      }

      if (body.event === 'charge.success') {
        transaction.status = 'success';
        transaction.save();

        const event = await this.eventModel.findOne({
          _id: transaction.eventId,
        });

        event.ticketedEventeesId.push(transaction.eventeeId);

        event.unticketedEventeesId.splice(
          event.unticketedEventeesId.indexOf(transaction.eventeeId),
          1,
        );

        event.save();

        const creator = await this.creatorModel.findOne({creatorId:event.creatorId})
        creator.allTicketedEventeesId.push(transaction.eventeeId)
        creator.save()

        const eventee = await this.eventeeModel.findOne({
          _id: transaction.eventeeId,
        });
        eventee.event_count = eventee.event_count + 1;
        eventee.bought_eventsId.push(event._id);
        eventee.save();


        const wallet = await this.walletModel.findOne({creatorId:creator.id, status:"active"})
        if(!wallet){
          return res.render("error", {message:"inactiveWallet"})
        }
  
        let amountInDollar = parseInt(transaction.amount) 
  
        wallet.balance = wallet.balance + (amountInDollar - (0.2 * amountInDollar))
        
        wallet.transactions.push(transaction._id)
        wallet.updatedAt = DateTime.now().toFormat('LLL d, yyyy \'at\' HH:mm')
        wallet.save()
  
        const exchangeRate = await this.currencyService.getExchangeRate(res)
        const amountPaidInNaira = Math.round(parseInt(transaction.amount)  * exchangeRate)

        const data = {
          name: `${eventee.first_name} ${eventee.last_name}`,
          event_title: event.title,
          amount: `NGN${amountPaidInNaira}`,
          ticketed_date: transaction.created_date,
          transactionId: transaction._id,
          eventId:event._id
        };

        const stData = JSON.stringify(data);

        const codeURL = await qrcode.toDataURL(stData);

        await this.mailservice.sendVerificationEmail({
          email: eventee.email,
          subject: 'Here is your Ticket',
          html: `<div>
        <p>Congratulation!!</p>
        <p>We are delighted to have you as an attendee for the event titled <b>"${event.title}"</b></p>
        <p>Below is your QR code.It is your Ticket to the event. Meaning this email must be presented at the venue for Verification.</p>
        <img src="${codeURL}" alt="Qr code" style="width: 200px; height: 200px"/>
        <p><strong>Note:</strong> A screenshot of the code is not verifiable.</p>
        <p>Your compliance will be appreciated. Thanks.</p>
        </div>`,
        });
      }

      if (body.event === 'charge.failed') {
        transaction.status = 'failed';
        transaction.save();
      }

      return res.send('call back received')
    } catch (err) {
      throw new Error(err.message)
    }
  }

  //-------------------------------Paystack call for successful transaction page---------------------------------------
  async getPaymentSuccessPage(res:Response) {
    try{
      return res.json({
        statusCode:200,
        message:"Successful Payment"
      })
    }catch(err){
      throw new Error(err.message)
    }
  }



// Bought events Page
async  getBoughtEventsPage(req:Request, res:Response) {
  try{
    await this.Authservice.ensureLogin(req,res)
    const eventee = await this.eventeeModel.findOne({_id:res.locals.user.id}).populate("bought_eventsId")
    let boughtEvents = []
    let count = 0
    for (const event of eventee.bought_eventsId){

      const theEvent = await this.eventModel.findOne({_id:event})
      let neededInfo = {
        title:theEvent.title,
        image:theEvent.event_image
      }
      boughtEvents.push(neededInfo)
      count++
    }
    return res.json({
      statusCode:200,
      numbers_of_boughtEvents:count,
      data:boughtEvents,
    }) 
  }catch(err){
    throw new Error(err.message)
  }
}

// Attended events Page
async  getAttendedEventsPage(req:Request, res:Response) {
  try{
    await this.Authservice.ensureLogin(req,res)
    const eventee = await this.eventeeModel.findOne({_id:res.locals.user.id}).populate("attended_eventsId")
    let attendedEvents = []
    let count = 0
    for (const event of eventee.attended_eventsId){

      const theEvent = await this.eventModel.findOne({_id:event})
      let neededInfo = {
        title:theEvent.title,
        image:theEvent.event_image
      }
      attendedEvents.push(neededInfo)
      count++
    }
    return res.json({
      statusCode:200,
      numbers_of_attendedEvents:count,
      data:attendedEvents,
    }) 
  }catch(err){
    throw new Error(err.message)
  }
}


  //--------------------------------Setting days to get reminded of coming events-----------------------------------
  async resetReminderDays(
    eventId: String,
    eventeeId: string,
    UpdateEventeeDto: UpdateEventeeDto,
    req: any,
    res: Response,
  ) {
    try {
      await this.Authservice.ensureLogin(req, res);
      const event = await this.eventModel.findOne({ _id: eventId });
      if (!event) {
        throw new NotFoundException("event not found")
      }

      const eventee = await this.eventeeModel.findOne({ _id: eventeeId });
      if (!eventee) {
        throw new NotFoundException("eventee not found")
      }

      let theDay = UpdateEventeeDto.eventeeReminder_days;
      if(!theDay){
        return res.json({
          statusCode:400,
          error:"reminder day can not be empty"
        })
      }

      eventee.eventeeReminder_days = theDay
      eventee.save();

      return res.json({
        statusCode:200,
        meessage:"Successful update",
        redirectedUrl:'/events/MyCheckList'
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }
}
