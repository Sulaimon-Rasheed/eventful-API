import { ConflictException, Injectable} from '@nestjs/common';
import { CreateCreatorDto } from './dto/create-creator.dto';
import { v2 } from 'cloudinary';
import { InjectModel } from '@nestjs/mongoose';
import { Creator } from './creators.model';
import { Event } from '../events/events.model';
import { Model } from 'mongoose';
import * as encoding from 'Utils/bcrypt';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { MailerService } from 'src/mailer/mailer.service';
dotenv.config();
import { v4 as uuidv4 } from 'uuid';
import { CreatorVerification } from './verifiedCreators.model';
import { LoginCreatorDto } from './dto/login-creator.dto';
import { AuthService } from 'src/auth/auth.service';
import { Request, Response } from 'express';
import { Wallet } from 'src/wallets/wallets.model';
import { Eventee } from 'src/eventees/eventees.model';
import { UpdateEventDto } from 'src/events/dto/update-event.dto';
import { CacheService } from 'src/cache/cache.service';
import { emailVerifyDto } from './dto/email-verify.dto';
import { newPasswordDto } from './dto/newPassword.dto';
import { DateTime } from 'luxon';
import { Transaction } from 'src/transactions/transactions.model';
import { debitDto } from './dto/debit.dto';


@Injectable()
export class CreatorsService {
  constructor(
    @InjectModel('Creator') private readonly creatorModel: Model<Creator>,
    @InjectModel('CreatorVerification')
    private readonly creatorVerificationModel: Model<CreatorVerification>,
    @InjectModel('Event') private readonly eventModel: Model<Event>,
    @InjectModel('Transaction') private readonly transactionModel: Model<Transaction>,
    @InjectModel('Eventee') private readonly eventeeModel: Model<Eventee>,
    @InjectModel('Wallet') private readonly walletModel: Model<Wallet>,
    private readonly mailservice: MailerService,
    private readonly Authservice: AuthService,
    private readonly cacheService: CacheService,
  ) {
    v2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  async createCreator(
    createCreatorDto: CreateCreatorDto,
    profileImage:Express.Multer.File,
    req:any,
    res: Response,
  ) {
    try {
      const existingCreator: object = await this.creatorModel.findOne({
        email: createCreatorDto.email,
      });
      if (existingCreator) {

        throw new ConflictException("User already exist.")
       
      }

      const password = await encoding.encodePassword(createCreatorDto.password);
      const result = await v2.uploader.upload(profileImage.path, {
        folder: 'eventful_creators_ProfileImage',
      });
      if (!result) {
        return res.json({
          statusCode:500,
          message:"Opps! file upload failed"
        })
      }

      let newCreator = await this.creatorModel.create({
        creator_name: createCreatorDto.creator_name,
        company_name: createCreatorDto.company_name,
        email: createCreatorDto.email,
        phoneNum: createCreatorDto.phoneNum,
        country: createCreatorDto.country,
        state: createCreatorDto.state,
        account_name:createCreatorDto.account_name,
        account_number:createCreatorDto. account_number,
        bank_name:createCreatorDto. bank_name,
        profileImage: result,
        password: password,
      });

      fs.unlink(profileImage.path, (err) => {
        if (err) {
          throw new Error(err.message);
        }
      });

      const currUrl = 'https://eventful-api-ky65.onrender.com';
      let uniqueString = newCreator._id + uuidv4();

      const hashedUniqueString = await encoding.encodePassword(uniqueString);

      await this.creatorVerificationModel.create({
        creatorId: newCreator._id,
        uniqueString: hashedUniqueString,
        creation_date: Date.now(),
        expiring_date: Date.now() + 21600000,
      });


       // create a wallet for the creator
       const newWallet = await this.walletModel.create({
        creatorId:newCreator._id,
        currency:"Naira",
      })

      newCreator.walletId = newWallet._id
      newCreator.save()

      await this.mailservice.sendVerificationEmail({
        email: createCreatorDto.email,
        subject: 'Verify your email',
        html: `<div style = "background-color:lightgrey; padding:16px"; border-radius:20px>
          <p>Hi, ${createCreatorDto.creator_name} of ${createCreatorDto.company_name}</P>
          <p>Thank you for opening account with us.</p>
          <p>We need to confirm it is you before being authorized to login to your account</P>
              <p>Click <a href=${
                currUrl +
                '/creators/verify/' +
                newCreator._id +
                '/' +
                uniqueString
              }>here</a> to get authorized</P>
              <p>This link <b>will expire in the next 6hrs</b></p>
              <p>We look forward to your impactfull events post on <b>Eventful</b></P>
              <p>Click this link: <a href=${
                currUrl +
                '/creators/verify/' +
                newCreator._id +
                '/' +
                uniqueString
              } >${currUrl + '/creators/verify/' + newCreator._id + '/' + uniqueString}<a/></p>
              </div>`,
      });

      return res.json({
        statusCode:201,
        message:"Successful signup. Check your email for verification link."
      })
      
    } catch (err) {
      throw new Error(err.message)
    }
  }


  getSignupPage(req:any, res:Response) {
    let currUrl = "https://eventful-api-ky65.onrender.com"
    try{
      return res.json({
        statusCode:200,
        page:"Sign Up page",
        signupUrl:`${currUrl}/creators/signup`
      })
      } catch (err) {
        throw new Error(err.message)
      }
    }


    getLoginPage(res:Response) {
      let currUrl = "https://eventful-api-ky65.onrender.com"
      try{
        return res.json({
          statusCode:200,
          page:"Login page",
          loginUrl:`${currUrl}/creators/login`
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
            emailAuthenticationUrl:`${currUrl}/creators/verifyEmailForPasswordReset`
          })
      }catch(err){
        throw new Error(err.message)
      }
      }

  async verifyCreator(userId: string, uniqueString: string, res: Response) {
    try {
      let user = await this.creatorVerificationModel.findOne({
        creatorId: userId,
      });

      if (!user) {
        return res.json({
          statusCode:404,
          message:"Opps!! user not found."
        })
      }

      if (user.expiring_date.getTime() < Date.now()) {
        await this.creatorVerificationModel.deleteOne({ creatorId: userId });
        await this.creatorModel.deleteOne({ _id: userId });
      }

      const valid = await encoding.validateEncodedString(
        uniqueString,
        user.uniqueString,
      );
      if (!valid) {
        return res.json({
          statusCode:400,
          message:"Opps!! It seems you have altered your verification link.Try again"
        })
        
      }

      await this.creatorModel.findByIdAndUpdate(
        { _id: userId },
        { verified: true },
      );
      await this.creatorVerificationModel.deleteOne({ creatorId: userId });

      return res.json({
        statusCode:200,
        message:"Successful Verification"
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

 

  
  // Verifying the email for password reset.
  async verifyEmailForPasswordReset(
    emailVerifyDto: emailVerifyDto,
    req: Request,
    res: Response,
  ) {
    try {
      const creator: Creator = await this.creatorModel.findOne({
        email: emailVerifyDto.email,
      });
      if (!creator) {
        return res.json({
          statusCode:404,
          message:"Opps!! User not found"
        })
      }

      const resetToken = uuidv4();
      const hashedResetToken = await encoding.encodePassword(resetToken);
      console.log(hashedResetToken);
      creator.passwordResetToken = hashedResetToken;
      // creator.passwordResetExpireDate = Date.now() + 10 * 60 * 1000
      console.log(resetToken);
      console.log(hashedResetToken);
      creator.save();
      const currUrl = 'https://eventful-api-ky65.onrender.com';
      this.mailservice.sendVerificationEmail({
        email: creator.email,
        subject: 'We received your request for password reset',
        html: `<div style = "background-color:lightgrey; padding:16px"; border-radius:20px>
        <p>Hi, ${creator.creator_name}</P>
        <p>Click the link below to reset your paasword.</P>
        <p><a href= ${currUrl + '/creators/resetPassword/newPassword/' + resetToken + '/' + creator.email}>
        ${currUrl + '/creators/resetPassword/newPassword/' + resetToken + '/' + creator.email}
        </a>
        </P>
        <p>This link <b>will expire in the next 10min</b></P>
        </div>`,
      });
      return res.json({
        statusCode:201,
        message:"Successful password reset request. check your email for verification link"
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  // Verifying Password reset Token
  async verifyUserPasswordResetLink(
    resetToken: string,
    email: string,
    res: Response,
  ) {
    try {
      const user = await this.creatorModel.findOne({ email: email });
      if (!user) {
        return res.json({
          statusCode:404,
          message:"Opps!! User not found"
        })
      }
      const valid = await encoding.validateEncodedString(
        resetToken,
        user.passwordResetToken,
      );
      if (!valid) {
        throw new Error("Invalid reset Token")
        
      }

      user.passwordResetToken = undefined;
      user.save();

      return res.json({
        statusCode:200,
        message:"Successful verification",
        passwordResetUrl:`/creators/newPassword/${user._id}`
      })
      
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async setNewPassword(
    newPasswordDto: newPasswordDto,
    userId: string,
    req:any,
    res: Response,
  ) {
    const user = await this.creatorModel.findOne({ _id: userId });
    if (!user) {
      return res.json({
        statusCode:404,
        message:`Opps!! User not found`
      })
    }

    const newPassword = newPasswordDto.newPassword;
    const hashedPassword = await encoding.encodePassword(newPassword);
    user.password = hashedPassword;
    user.save();

    return res.json({
      statusCode:201,
      message:"Successful password reset. You can now login with your new password."
    })
  }

  // Creators login
  async login(LoginCreatorDto: LoginCreatorDto, res: Response) {
    try {
      const { email, password } = LoginCreatorDto;
      let user = await this.creatorModel.findOne({ email });

      if (!user) {
        return res.json({
          statusCode:401,
          message:`Opps!! User not found`
        })
      }

      if (!user.verified) {
        return res.json({
          statusCode:401,
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
          message:`Opps!! email or password is incorrect.`,
        })
      }

      const token: string = this.Authservice.generateJwtToken(
        user._id,
        user.email,
        user.creator_name,
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

  async getCreatorHomePage(req: any, res: Response) {
    try {
        return res.json({
          statusCode:200,
          page:"Welcome to the Creator home page",
          purpose:"...where the unforgetable moments are created"
        })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async getDashboard(req: any, res: Response, page: any) {
    try {
      await this.Authservice.ensureLogin(req, res);
     
      let stringifyPage: any = req.query.page || 0;
      let page = parseInt(stringifyPage);
      

      const theEvents = await this.cacheService.get(
        `creatorDashBoard_${res.locals.user.id}_${page}`,
      );

      if (!theEvents) {
        const eventPerPage: number = 10;

        const events: any = await this.eventModel
          .find({ creatorId: res.locals.user.id })
          .sort({ created_date: 'desc' })
          .skip(page * eventPerPage)
          .limit(eventPerPage);

        if (!events) {
          return res.json({
            statusCode:200,
            message:`Welcome ${res.locals.user.name} to your dashboard. You have not created any event yet`,
            result:[]
          })
        }

        let theEvents = []
        
        for(const event of events){
          if(event.state == "Draft"){
            let draftDate = event.created_date;
            let parsedDate = DateTime.fromFormat(
            draftDate,
            'LLL d, yyyy \'at\' HH:mm',
          );

          let currentDate = DateTime.now();
          const pastDay = currentDate.diff(parsedDate, 'days').toObject().days

          
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
              drafted:theDay,
              event_Id:event._id,
              title:event.title,
              eventImage:event.event_image.url,
              time:`${event.starting_time} - ${event.ending_time}`,
              venue:event.venue,
              creator:event.creatorId,
              required_action:"Go to the event posting endpoint to Post this event"
              
            }
            theEvents.push(neededInfo)
          
          }else{

            let postDate = event.posted_date;
            let parsedDate = DateTime.fromFormat(
              postDate,
              "LLL d, yyyy",
            );

            let currentDate = DateTime.now();
            const pastDay = currentDate.diff(parsedDate, 'days').toObject().days

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
              event_Id:event._id,
              title:event.title,
              eventImage:event.event_image.url,
              time:`${event.starting_time} - ${event.ending_time}`,
              venue:event.venue,
              creator:event.creatorId,
              analytics:"You can get the count of ticketedEventees, unticketedEventees and scannedEventees of this event. Go to the respective route.Copy the event ID from above."
            }
            theEvents.push(neededInfo)
          }
        }
      
        await this.cacheService.set(
          `creatorDashBoard_${res.locals.user.id}_${page}`,
          theEvents,
        );

        return res.json({
          statusCode:200,
          message:`Welcome ${res.locals.user.name} to your dashboard`,
          profileImage:`${res.locals.user.image.url}`,
          data:theEvents,
        })
        
      }
      
      return res.json({
        statusCode:200,
        message:`Welcome ${res.locals.user.name} to your dashboard`,
        profileImage:`${res.locals.user.image.url}`,
        posted_Events:theEvents,
      })
      
    } catch (err) {
      throw new Error(err.message)
    }
  }

//-------------------Opening the Wallet----------------------
async openWallet(req:any, res:Response){
  try{
    await this.Authservice.ensureLogin(req, res);
    const wallet = await this.walletModel.findOne({creatorId:res.locals.user.id, status:"active"}).populate("transactions")
    if(!wallet){
      return res.json({
        code:403,
        error:"Inactive wallet.Your free subscription has expired."
      })
    }

    let theTransactions = []

    for (const transactionId of wallet.transactions){
      const transaction = await (await this.transactionModel.findOne({_id:transactionId}).populate("eventeeId")).populate("eventId")
      theTransactions.push(transaction)
    }

    let transactionsInfo = []
    let theName;
    let theTittle;
    for(const eachTransact of theTransactions){
      if(eachTransact.type == "credit"){
        theName = `${eachTransact.eventeeId.first_name} ${eachTransact.eventeeId.last_name}`
        theTittle = eachTransact.eventId.title
      }else{
        theName = res.locals.user.name
        theTittle = null
      }
      let neededInfo = {
        name:theName,
        amount:eachTransact.amount,
        event_title:theTittle,
        transaction_type:eachTransact.type,
        transaction_date:eachTransact.created_date,
        status:eachTransact.status
      }
      transactionsInfo.push(neededInfo)
    }

    return res.json({
      statusCode:200,
      meaasage:"This is your wallet Info.",
      balance:wallet.balance,
      last_update:wallet.updatedAt,
      transaction_history:transactionsInfo

    })

  }catch(err){
    throw new Error(err.message)
  }
}

// -----------------------Wallet Debit
async debitWallet(debitDto:debitDto, walletId:string, req:any, res:Response, ){
  try{
  await this.Authservice.ensureLogin(req, res)

  const creator = await this.creatorModel.findOne({_id:res.locals.user.id})
  if(!creator){
    return res.json({
      statusCode:401,
      error:"Creator not found"
    })
  }

  const amount = parseInt(debitDto.debit_amount)
  const wallet = await (await this.walletModel.findOne({_id:walletId, status:"active"})).populate("transactions")
  if(!wallet){
    return res.json({
      statusCode:403,
      error:"Wallet not active"
    })
  }

  if(wallet.balance - amount < 0){
    return res.json({
      statusCode:431,
      error:"Insufficient Balance"
    })
  }

  wallet.balance = wallet.balance - amount
  wallet.updatedAt = DateTime.now().toFormat('LLL d, yyyy \'at\' HH:mm')
  

  const newTransaction = await this.transactionModel.create({
    amount:`${-amount}`,
    status:"success",
    type:"debit",
    creatorId:res.locals.user.id
  })

  wallet.transactions.push(newTransaction._id)
  wallet.save()

  await this.mailservice.sendVerificationEmail({
    email:"maito4me@gmail.com",
      subject: 'Credit request',
      html: `<div style = "background-color:lightgrey; padding:16px"; border-radius:20px>
        <p>Hi, Account officer</P>
        <p>${creator.creator_name} of ${creator.company_name} just made a request to be credited with N${amount}</p>
        <p>Ensure the user is credited within the next 24hrs</P>
        <h2>Account Details</h2>
        <p><strong>Account name</strong>${creator.account_name}</P>
        <p><strong>Account number</strong>${creator.account_number}</P>
        <p><strong>Bank name</strong>${creator.bank_name}</P>
        <p>Thanks</P>
    </div>`,
  })

  return res.json({
    statusCode:200,
    message:"Successful Transaction",
    balance:wallet.balance
  })
}catch(err){
  throw new Error(err.message)
}
}

  //---------------------------------------Filtering event by state--------------------------------
  async filterEventByState(req: Request, res: Response, page: any) {
    try {
      await this.Authservice.ensureLogin(req, res);
     
      let state = req.query.state || 'All';
      let stringifyPage: any = req.query.page || 0;
      let page = parseInt(stringifyPage);

      let theEvents;
      if (state == 'All') {
        theEvents = await this.cacheService.get(
          `creatorFilterdDashBoard_${res.locals.user.id}_All`,
        );

        if (!theEvents) {
          const eventPerPage: number = 10;

          let events: any;

          events = await this.eventModel
            .find({ creatorId: res.locals.user.id })
            .sort({ created_date: 'desc' })
            .skip(page * eventPerPage)
            .limit(eventPerPage);

          if (!events) {
            return [];
          }
          let theEvents = []
          for(const event of events){
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
              shareEventUrl:`https://eventful-api-ky65.onrender.com/events/thisEvent/${event._id}`
              
            }
    
            theEvents.push(neededInfo)
          }
    

          await this.cacheService.set(
            `creatorFilterdDashBoard_${res.locals.user.id}_All`,
            theEvents,
          );
          return res.json({
            statusCode:200,
            message:`Welcome ${res.locals.user.name}`,
            profileImage:`${res.locals.user.image.url}`,
            data:theEvents,
          })
          
        }
      } else {
        theEvents = await this.cacheService.get(
          `creatorFilterdDashBoard_${res.locals.user.id}_${state}`,
        );

        if (!theEvents) {
          const eventPerPage: number = 10;
          let events: any;

          events = await this.eventModel
            .find({ creatorId: res.locals.user.id, state: state })
            .sort({ created_date: 'desc' })
            .skip(page * eventPerPage)
            .limit(eventPerPage);

          if (!events) {
            return [];
          }

         
      let theEvents = []
      for(const event of events){
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
            `creatorFilterdDashBoard_${res.locals.user.id}_${state}`,
            theEvents,
          );
          return res.json({
            statusCode:200,
            message:`Welcome ${res.locals.user.name}`,
            profileImage:`${res.locals.user.image.url}`,
            result:events,
          })
          
          
        }
      }
      return res.json({
        statusCode:200,
        message:`Welcome ${res.locals.user.name}`,
        profileImage:`${res.locals.user.image.url}`,
        data:theEvents,
      })
      
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async getUnticketedEventees(eventId: string, req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      
      const event = await this.eventModel
        .findOne({ _id: eventId })
        .populate('unticketedEventeesId');
      if (!event) {
        return res.json({
          code:404,
          error:"Event not found"
        })
      }
      let unticketedEventees = [];
      let count = 0;
      for (const eventee of event.unticketedEventeesId) {
        const theEventee = await this.eventeeModel.findOne({_id:eventee})
        let neededInfo = {
          name:`${theEventee.first_name} ${theEventee.last_name}`,
          profileImage:theEventee.profileImage,
          phoneNumber:theEventee.phoneNum,
          email:theEventee.email
        }
        
        unticketedEventees.push(neededInfo);
        count++;
      }
      
      return res.json({
        statusCode:200,
        numbers_of_unticketedEventees:count,
        result:unticketedEventees,
      }) 
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async getTicketedEventees(eventId: string, req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      
      const event = await this.eventModel
        .findOne({ _id: eventId })
        .populate('ticketedEventeesId');
      if (!event) {
        return res.json({
          statusCode:404,
          error:"Event not found"
        })
      }
      let ticketedEventees = [];
      let count = 0;
      for (const eventee of event.ticketedEventeesId) {
        const theEventee = await this.eventeeModel.findOne({_id:eventee})
        let neededInfo = {
          name:`${theEventee.first_name} ${theEventee.last_name}`,
          profileImage:theEventee.profileImage,
          phoneNumber:theEventee.phoneNum,
          email:theEventee.email
        }
        
        
        ticketedEventees.push(neededInfo);
        count++;
      }

      return res.json({
        statusCode:200,
        numbers_of_ticketedEventees:count,
        result:ticketedEventees,
      }) 

    } catch (err) {
      throw new Error(err.message)
    }
  }


  async getScannedEventees(eventId: string, req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      
      const event = await this.eventModel
        .findOne({ _id: eventId })
        .populate('scannedEventeesId');
      if (!event) {
        return res.json({
          statusCode:404,
          error:"Event not found"
        })
      }
      let scannedEventees = [];
      let count = 0;
      for (const eventee of event.scannedEventeesId) {
        const theEventee = await this.eventeeModel.findOne({_id:eventee})
        let neededInfo = {
          name:`${theEventee.first_name} ${theEventee.last_name}`,
          profileImage:theEventee.profileImage,
          phoneNumber:theEventee.phoneNum,
          email:theEventee.email
        }
        
        scannedEventees.push(neededInfo);
        count++;
      }

      return res.json({
        statusCode:200,
        numbers_of_scannedEventees:count,
        result:scannedEventees,
      }) 
  
    } catch (err) {
      throw new Error(err.message)
    }
  }


  //------------------Getting ALL THE TIME eventees that bougth the ticket of a creator events but was not in attendance-------------------------------------------

  async getAllTicketedEventees(req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      
      const creator = await this.creatorModel.findOne({ _id:res.locals.user.id})
    
      if (!creator) {
        return res.json({
          statusCode:404,
          error:"Creator not found"
        })
      }
      let allTicketedEventees = [];
      let count = 0;
      for (const eventee of creator.allTicketedEventeesId) {
        const theEventee = await this.eventeeModel.findOne({_id:eventee})
        let neededInfo = {
          name:`${theEventee.first_name} ${theEventee.last_name}`,
          profileImage:theEventee.profileImage,
          phoneNumber:theEventee.phoneNum,
          email:theEventee.email
        }
        
        
        allTicketedEventees.push(neededInfo );
        count++;
      }

      return res.json({
        statusCode:200,
        numbers_of_allTicketedEventees:count,
        result:allTicketedEventees,
      }) 

    } catch (err) {
      throw new Error(err.message)
    }
  }

  //----------------Getting All THE TIME Eventees that attended a creator events with their QR code scanned-----------------------------------------
  async getAllScannedEventees(req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
       
      const creator = await this.creatorModel.findOne({ _id:res.locals.user.id})
    
      if (!creator) {
        return res.json({
          statusCode:404,
          error:"Creator not found"
        })
      }
      let allScannedEventees = [];
      let count = 0;
      for (const eventee of creator.allScannedEventeesId) {
        const theEventee = await this.eventeeModel.findOne({_id:eventee})
        let neededInfo = {
          name:`${theEventee.first_name} ${theEventee.last_name}`,
          profileImage:theEventee.profileImage,
          phoneNumber:theEventee.phoneNum,
          email:theEventee.email
        }
        
        
        allScannedEventees.push(neededInfo);
        count++;
      }

      return res.json({
        statusCode:200,
        numbers_of_allScannedEventees:count,
        result:allScannedEventees,
      }) 
    
    } catch (err) {
      throw new Error(err.message)
    }
  }



  async resetReminderDays(
    eventId: String,
    UpdateEventDto: UpdateEventDto,
    req: any,
    res: Response,
  ) {
    try {
      await this.Authservice.ensureLogin(req, res);
      const event = await this.eventModel.findOne({ _id: eventId });
      if (!event) {
        return res.json({
          code:404,
          error:"Event not found"
        })
      }

      let theDay = UpdateEventDto.reminder_days;
      if(!theDay){
        return res.json({
          statusCode:400,
          error:"reminder day can not be empty"
        })
      }

      event.reminder_days = theDay
      event.save();

      return res.json({
        success:"Successful update"
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async getScanner(req: any, res: Response) {
    try {
        await this.Authservice.ensureLogin(req, res);
        return res.json({
          statusCode:200,
          page:"Scanner page"
        })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async getScanningResult(encodedResult:string, req: any, res: Response){
    try {
      await this.Authservice.ensureLogin(req, res);
      const result = decodeURIComponent(encodedResult)
      const parsedObject = JSON.parse(result);
      const transaction = await this.transactionModel.findOne({_id:parsedObject.transactionId}).populate("eventeeId").populate("eventId")
      
      if(!transaction){
        throw new Error("Transaction not found")
      }

      const eventId = transaction.eventId
      const event = await this.eventModel.findOne({_id:eventId})

      if(!event){
        throw new Error("Event not found")
      }

      if(event.scannedEventeesId.includes(transaction.eventeeId)){
        throw new Error("This Qrcode has been scanned before")
      }

      event.scannedEventeesId.push(transaction.eventeeId)
      event.save()

      const creator = await this.creatorModel.findOne({creatorId:event.creatorId})
      creator.allScannedEventeesId.push(transaction.eventeeId)
      creator.save()

      const eventee = await this.eventeeModel.findOne({_id:transaction.eventeeId})
      eventee.attended_eventsId.push(transaction.eventId)
      eventee.save()

      res.json({
        statusCode:200,
        message:"Scanning result Saved successfully"
      })

  } catch (err) {
      throw new Error(err.message)
  }
  }

}
