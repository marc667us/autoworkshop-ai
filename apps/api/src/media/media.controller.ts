import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { validatedBody } from '../common/validation/validated-body';
import { MediaService, type OwnerType } from './media.service';
import { ConfirmUploadBody, OWNER_TYPES, RequestUploadUrlBody } from './media.schemas';

/**
 * Attachments — `POST /media/upload-url`, the browser's PUT, then confirm.
 *
 * 🔴 THIS CONTROLLER IS THE POINT OF SLICE 1. `StorageService` had a complete
 * SigV4 presigner and an integration spec and was reachable from nothing: no
 * module listed it, no controller called it. A capability with no route is not a
 * capability. See `MediaService`'s header for the other three times this exact
 * shape has appeared in this repository.
 *
 * ⚠️ EVERY ROUTE IS TENANT-GUARDED. There is no public attachment surface, and
 * there must not be: the bucket holds photographs of customers' vehicles.
 */
@Controller('media')
@UseGuards(TenantGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Step 1 — resolve the owner, record the intent, return a presigned PUT. */
  @Post('upload-url')
  requestUploadUrl(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(RequestUploadUrlBody)) body: RequestUploadUrlBody,
  ) {
    return this.media.requestUploadUrl(req.tenantContext, body);
  }

  /** Step 3 — the file landed; make it visible. */
  @Post(':id/confirm')
  confirmUpload(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(validatedBody(ConfirmUploadBody)) body: ConfirmUploadBody,
  ) {
    return this.media.confirmUpload(req.tenantContext, id, body ?? {});
  }

  /**
   * Everything attached to one record.
   *
   * ⚠️ THE OWNER IS VALIDATED HERE RATHER THAN TRUSTED FROM THE QUERY STRING.
   * `ownerType` reaches `MediaService` as a table lookup key, so an unchecked
   * value would be an injection site the moment `OWNER_TABLES` grew an entry
   * built from input. Narrowing it at the boundary keeps that impossible rather
   * than merely unlikely.
   */
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query('ownerType') ownerType: string,
    @Query('ownerId') ownerId: string,
  ) {
    const parsed = z
      .object({ ownerType: z.enum(OWNER_TYPES), ownerId: z.string().uuid() })
      .strict()
      .parse({ ownerType, ownerId });
    return this.media.listForOwner(req.tenantContext, parsed.ownerType, parsed.ownerId);
  }

  /**
   * Detach a file from a record.
   *
   * The ASSET survives — see `MediaService.unlink`. `media.assets` has no DELETE
   * grant, so who uploaded what stays answerable after a photograph is removed.
   */
  @Delete(':id/link')
  unlink(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('ownerType') ownerType: string,
    @Query('ownerId') ownerId: string,
  ) {
    const parsed = z
      .object({ ownerType: z.enum(OWNER_TYPES), ownerId: z.string().uuid() })
      .strict()
      .parse({ ownerType, ownerId });
    return this.media.unlink(
      req.tenantContext,
      id,
      parsed.ownerType as OwnerType,
      parsed.ownerId,
    );
  }
}
