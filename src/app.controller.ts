import { Controller, Get, Render, Req, Res } from '@nestjs/common';
import { AppService } from './app.service';
import {Response, Request} from "express"


@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHome(){
      return {message:'Welcome to Eventful'}
  }

  @Get("/helpCenter")
  async getHelpCenter(@Req() req:Request, @Res() res:Response){
    await this.appService.getHelpCenter(req, res)
  }

  @Get("/help/checklisting")
  async getChecklisiting(@Req() req:Request, @Res() res:Response){
    await this.appService.getChecklisiting(req, res)
  }
  
  @Get("/help/ticketPurchase")
  async getTicketPurchase(@Req() req:Request, @Res() res:Response){
    await this.appService.getTicketPurchase(req, res)
  }

  
  @Get("/help/share")
  async getShare(@Req() req:Request, @Res() res:Response){
    await this.appService.getShare(req, res)
  }

  @Get("/help/eventeeAnalytics")
  async getEventeeAnalytics(@Req() req:Request, @Res() res:Response){
    await this.appService.getEventeeAnalytics(req, res)
  }

  @Get("/help/ticketScanning")
  async getTicketScanning(@Req() req:Request, @Res() res:Response){
    await this.appService.getTicketScanning(req, res)
  }

  @Get("/help/update")
  async getUpdate(@Req() req:Request, @Res() res:Response){
    await this.appService.getUpdate(req, res)
  }

  @Get("/help/payout")
  async getPayout(@Req() req:Request, @Res() res:Response){
    await this.appService.getPayout(req, res)
  }

  @Get("/help/creatorAnalytics")
  async getCreatorAnalytics(@Req() req:Request, @Res() res:Response){
    await this.appService.getCreatorAnalytics(req, res)
  }

  @Get("/faq")
  async getFaq(@Req() req:Request, @Res() res:Response){
    await this.appService.getFaq(req, res)
  }

}
