import { Injectable } from '@nestjs/common';
import * as jwt from "jsonwebtoken"
import * as dotenv from "dotenv"
import {Request, Response} from 'express';
dotenv.config()

@Injectable()
export class AuthService {
    private readonly jwtSecret: string = process.env.JWT_SECRET;

    generateJwtToken(id: object, email:string, name:string, image:object, res:Response): string {
        try{
            const tokenPayload = { id, email, name, image };
            return jwt.sign(tokenPayload, this.jwtSecret, { expiresIn: '2h' }); 
        }catch(err){
            throw new Error(err.meessage)
        }
    
    }

    async ensureLogin(req:Request, res:Response){
        try{

            const bearerwithToken = req.headers.authorization
            
            if(!bearerwithToken){
              return res.json({
                code:401,
                message:"Jwt is required"
              })
          }
            const token = bearerwithToken.split(" ")[1]
            const decoded = await jwt.verify(token , process.env.JWT_SECRET)
            console.log(decoded)
            res.locals.user = decoded

        }catch(err){
            throw new Error(err.meessage)
        }
       
    }

}
