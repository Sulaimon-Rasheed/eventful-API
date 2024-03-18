import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request, Response } from 'express';
import { Model } from 'mongoose';
import {Event} from "./events/events.model"
import { CacheService } from './cache/cache.service';

@Injectable()
export class AppService {
  constructor( @InjectModel('Event') private eventModel: Model<Event>,private readonly cacheService:CacheService,){}
  getError(): string {
    return "error";
  }

  async getHome(req:Request, res:Response){
    let theEvents = await this.cacheService.get("homePage")
    if(!theEvents){
      const events = await this.eventModel
      .find({state:"Posted"})
      .populate("creatorId")
      .sort({ created_date: 'desc' })
      .limit(5)

      let theEvents = []
      for(const ev of events){
        const neededInfo = {
          title:ev.title,
          image:ev.event_image,
          date:ev.event_date,
          time:`${ev.starting_time} - ${ev.ending_time} WAT`,
          venue:ev.venue,
        }
        theEvents.push(neededInfo) 
      }

      this.cacheService.set(`homePage`, theEvents)
      return res.json({
        statusCoode:200,
        message:"Eventful. ...your passport to a world of unforgettable moments",
        data:theEvents
      })
    }
    return res.json({
      statusCoode:200,
      message:"Eventful. ...your passport to a world of unforgettable moments",
      data:theEvents
    })
  }
  
  
  
  getHelpCenter(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the Help center"
    })
  }

  getChecklisiting(req:Request, res:Response){
  return res.json({
    statusCoode:200,
      message:"Welcome to the 'Checklisiting' documentation page"
    })
  }

  getTicketPurchase(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Ticket Purchase' documentation page"
    })
  }

  getShare(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Event Sharing' documentation page"
    })
  }

  getEventeeAnalytics(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Eventee Analytics' documentation page"
    })
  }

  getTicketScanning(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Ticket scanning' documentation page"
    })
  }

  getUpdate(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Event update' documentation page"
    })
  }

  getPayout(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Payout system' documentation page"
    })
  }

  getCreatorAnalytics(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'Creator Analytics' documentation page"
    })
  }

  getFaq(req:Request, res:Response){
    return res.json({
      statusCoode:200,
      message:"Welcome to the 'FAQ' documentation page"
    })
  }
  
}
