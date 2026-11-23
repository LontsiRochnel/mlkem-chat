/**
 * Routes des messages (toutes protégées par Bearer) :
 * - GET  /conversations                       contacts ayant au moins un message
 * - GET  /conversations/:username/messages    fil avec un contact
 * - POST /messages                            envoi (TEXT ou KEM_CIPHERTEXT)
 */
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest, AuthGuard } from '../auth/auth.guard';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  conversations(@Req() req: AuthedRequest) {
    return this.messages.conversations(req.user!.username);
  }

  @Get('conversations/:username/messages')
  thread(@Req() req: AuthedRequest, @Param('username') other: string) {
    return this.messages.thread(req.user!.username, other);
  }

  @Post('messages')
  send(@Req() req: AuthedRequest, @Body() body: Record<string, unknown>) {
    return this.messages.send(req.user!.username, body);
  }
}
