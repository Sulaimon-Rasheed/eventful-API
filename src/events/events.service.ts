import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Event } from './events.model';
import { Model } from 'mongoose';
import { Creator } from '../creators/creators.model';
import { MailerService } from 'src/mailer/mailer.service';
import { AuthService } from 'src/auth/auth.service';
import { v2 } from 'cloudinary';
import * as dotenv from 'dotenv';
import { SocialmediaService } from 'src/socialmedia/socialmedia.service';
dotenv.config();
import {DateTime} from "luxon"
import { Auth0Service } from 'src/auth/auth0.service';
import { CacheService } from 'src/cache/cache.service';
import  * as sanitizeHtml from "sanitize-html"

@Injectable()
export class EventsService {
  constructor(
    @InjectModel('Event') private eventModel: Model<Event>,
    @InjectModel('Creator') private readonly creatorModel: Model<Creator>,
    private readonly mailservice: MailerService,
    private readonly Authservice: AuthService,
    private readonly socialmediaService:SocialmediaService,
    private readonly Auth0servce:Auth0Service,
    private readonly cacheService:CacheService
  ) {
    v2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async createEvent(
    createEventDto: CreateEventDto,
    filePath: string,
    req: any,
    res: Response,
  ) {
    try {
      await this.Authservice.ensureLogin(req, res);

      const result = await v2.uploader.upload(filePath, {
        folder: 'eventful_event_image',
      });

      const luxonDeadlineDateTime = DateTime.fromISO(createEventDto.registration_deadline);
      const formattedDeadlineDate = luxonDeadlineDateTime.toFormat('LLL d, yyyy');

      const luxonEventDateTime = DateTime.fromISO(createEventDto.event_date);
      const formattedEventDate = luxonEventDateTime.toFormat('LLL d, yyyy');

      const upperCaseTittle = createEventDto.title.toUpperCase()

      const sanitizedContent = sanitizeHtml(createEventDto.description);
      const sanitizedAddContent = sanitizeHtml(createEventDto.additional_info);
      const newEvent = await this.eventModel.create({
        title: upperCaseTittle,
        description: sanitizedContent,
        location: createEventDto.venue,
        event_date:formattedEventDate ,
        starting_time:createEventDto.starting_time,
        ending_time:createEventDto.ending_time,
        venue:createEventDto.venue,
        reminder_days:createEventDto.reminder_days,
        category:createEventDto.category,
        registration_deadline:formattedDeadlineDate,
        ticket_price: createEventDto.ticket_price,
        discount: createEventDto.discount,
        event_image: result,
        additional_info:sanitizedAddContent,
        creatorId: res.locals.user.id,
      });

      const creator = await this.creatorModel.findOne({_id:res.locals.user.id})
      if(!creator){
        return res.render("error", {message:"creatorNotFound"})
      }


      creator.eventsId.push(newEvent._id)
      
      return res.json({
        message:"Event created successfully",
        redirectedUrl:"/events/createEvent"
      })
    
    } catch (err) {
      throw new Error(err.message)
    }
  }



  async getEventCreationPage(req:any, res: Response) {
    try{
      let currUrl = "https://eventful-api-ky65.onrender.com"
      await this.Authservice.ensureLogin(req, res);
      const user = await this.creatorModel.findOne({ _id: res.locals.user.id });
     
      if (user.freePlan == false) {
        res.json({
          error:"Your free plan has expired"
        })
      }

      res.json({
        page:"Event creation page",
        eventCreationUrl:`${currUrl}/events/createEvent`
      })
        
    } catch (err) {
      throw new Error(err.message)
    }
  }


  async getEventUpdatePage(req:any, res:Response, eventId:string){
    try{
      await this.Authservice.ensureLogin(req,res)

      let neededInfo = await this.cacheService.get(`eventUpdate_${res.locals.user.id}_${eventId}`)
      
      if(!neededInfo){
        let event = await this.eventModel.findOne({_id:eventId})
        
        if(!event){
          return res.json({
            error:"Event not found"
          })
        }

        let neededInfo = {
          eventId:event._id,
          title:event.title,
          image:event.event_image,
          description:event.description
        }

        await this.cacheService.set(`eventUpdate_${res.locals.user.id}_${eventId}`, neededInfo)
        return res.json({
          page:"Event Update page",
          eventToUpdate:neededInfo
        })
      }
      return res.json({
        page:"Event Update page",
        eventToUpdate:neededInfo
      })
     
    }catch(err){
      return res.render("catchError", {catchError:err.message});
    }
  }
  


  async updateEvent(req:any, res:Response, eventId:string, UpdateEventDto:UpdateEventDto){
    try{
      await this.Authservice.ensureLogin(req,res)
      const sanitizedContent = sanitizeHtml(UpdateEventDto.description);
        const event = await this.eventModel.findByIdAndUpdate(eventId, {description:sanitizedContent})
        if(!event){
          throw new NotFoundException("Event not found")
        }

        await this.cacheService.remove(`eventUpdate_${res.locals.user.id}_${eventId}`)
  
      for(let page = 0; page<100; page++){
        await this.cacheService.remove(`creatorDashBoard_${res.locals.user.id}_${page}`)
      }
      return res.json({
        message:"Successful update"
      })
      
    }catch(err){
      throw new Error(err.message)
    }
  }

  async deleteEvent(req:any, res:Response, eventId:string){
    try{
      await this.Authservice.ensureLogin(req,res)
      const event = await this.eventModel.findByIdAndDelete(eventId)
      if(!event){
        return res.render("error", {message:"eventNotFound"})
      }

      await this.cacheService.remove(`eventUpdate_${res.locals.user.id}_${eventId}`)
      return res.json({
        message:"Event successfully deleted"
      })
    }catch(err){
      throw new Error(err.message)
    }
  }



  async postEvent(id: string, req: any, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      const event = await this.eventModel.findOne({ _id: id });
      if (!event) {
        throw new NotFoundException("event not found")
      }
      await this.eventModel.findByIdAndUpdate(id, {
        state: 'Posted',
        posted_date:DateTime.now().toFormat('LLL d, yyyy'),
      });

      for(let page = 0; page<100; page++){
        await this.cacheService.remove(`creatorDashBoard_${res.locals.user.id}_${page}`)
      }
      
      return res.json({
        message:"Event successfully posted",
        reidrectedUrl:"/creators/creatorDashboard"
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async chooseEvent(eventId: string, req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      const chosenEvent = await this.eventModel.findOne({ _id: eventId });
      if (chosenEvent.unticketedEventeesId.includes(res.locals.user.id)) {
        return res.json({
          message:"Opps!! You have listed this event before"
        })
      }
      if (chosenEvent.ticketedEventeesId.includes(res.locals.user.id)) {
        return res.json({
          message:"Opps!! You have bought this event ticket before"
        })
      }


      let regDeadline = DateTime.fromFormat(chosenEvent.registration_deadline, "LLL d, yyyy")
      let currentDate = DateTime.now();
      let difference = currentDate.diff(regDeadline, 'days').toObject().days
      
      if(difference > 0){
        return res.json({
          message:"Opps!! Ticket purchase has expired"
        })
      }

      chosenEvent.unticketedEventeesId.push(res.locals.user.id);
      await chosenEvent.save();

      return res.json({
        message:"Event added successfully",
        redirectUrl:'/eventees/eventeeDashboard'
      })
      
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async removeEvent(eventId: string, req: Request, res: Response) {
    try {
      await this.Authservice.ensureLogin(req, res);
      const eventToRemove = await this.eventModel.findOne({ _id: eventId });
      if (!eventToRemove.unticketedEventeesId.includes(res.locals.user.id) && !eventToRemove.ticketedEventeesId.includes(res.locals.user.id)) {
        return res.render("error", {message:"eventNotOnListBefore"});
      }

      if (eventToRemove.ticketedEventeesId.includes(res.locals.user.id) && !eventToRemove.unticketedEventeesId.includes(res.locals.user.id)) {
        return res.render("error", {message:"eventNotRemovable"});
      }

      const index = eventToRemove.unticketedEventeesId.indexOf(res.locals.user.id);
      eventToRemove.unticketedEventeesId.splice(index, 1);
      eventToRemove.save();
      return res.json({
        message:"Event removed successfully",
        redirectUrl:'/eventees/eventeeDashboard'
      })
    } catch (err) {
      throw new Error(err.message)
    }
  }

  async getMyCheckList(req: Request, res: Response) {
    try{
    await this.Authservice.ensureLogin(req, res);
    
      const events = await this.eventModel.find().sort({created_time:"desc"});
      let myCheckLists: object[] = [];
      
      for (const event of events) {
        if (event.unticketedEventeesId.includes(res.locals.user.id) || event.ticketedEventeesId.includes(res.locals.user.id)) {
          const neededInfo = {
            title:event.title,
            eventImage:event.event_image,
            time:`${event.starting_time} - ${event.ending_time}`,
            venue:event.venue,
            price:event.ticket_price,
            purchaseUrl:`http://localhost:9000/eventees/buyTicket/${res.locals.user.id}/${event.ticket_price}`

          }
          
          myCheckLists.push(neededInfo);
        }
      }
      await this.cacheService.set(`event_${res.locals.user.id}`, myCheckLists)

      return res.json({
        message:"Your Checklist",
        data:myCheckLists,
      })
      
    
    }catch(err){
      throw new Error(err.message)
    }
  }

  async getThisEvent(eventId:string, res:Response){
    try{
      let neededInfo = await this.cacheService.get(`thisEvent_${eventId}`)
      if(!neededInfo ){
        const event = await this.eventModel.findOne({_id:eventId}).populate("creatorId")
        if(!event){
          throw new NotFoundException("event not found")
        }

        const neededInfo = {
          title:event.title,
          eventImage:event.event_image,
          about:event.description,
          date:event.event_date,
          time:`${event.starting_time} - ${event.ending_time}`,
          venue:event.venue,
          registration_deadline:event.registration_deadline,
          price:event.ticket_price,
          purchaseUrl:`https://eventful-api-ky65.onrender.com/eventees/buyTicket/${res.locals.user.id}/${event.ticket_price}`

        }

        await this.cacheService.set(`thisEvent_${eventId}`, neededInfo)
  
        return res.json({
          data:neededInfo 
        })
        
      }
      return res.json({
        data:neededInfo
      })
      
    }catch(err){
        return new Error(err.message)
      }
  }



}
