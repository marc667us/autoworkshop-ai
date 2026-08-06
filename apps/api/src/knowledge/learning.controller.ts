import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { LearningService } from './learning.service';

/**
 * Learning materials and diagnostic trees - slice 16.
 *
 * Read-only. Authoring a course, a material or a tree is workshop
 * administration and belongs with the rest of the knowledge library's writes;
 * these routes exist so the technician's own three learning entries and the
 * diagnostic-tree entry stop being signposts.
 *
 * The gate is on the SERVICE, not this controller - a controller guard covers
 * the routes that exist today, and the rule has to cover tomorrow's caller.
 */
const KINDS = ['video', 'audio', 'assessment', 'document'] as const;

@Controller('learning')
@UseGuards(TenantGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('materials')
  materials(@Req() req: AuthenticatedRequest, @Query('kind') kind?: string) {
    // An unknown kind returns documents rather than erroring: the query string
    // comes from a link, and a 400 on a typo is a dead end for the reader.
    const k = KINDS.includes(kind as (typeof KINDS)[number]) ? kind! : 'document';
    return this.learning.listMaterials(req.tenantContext, k);
  }

  @Get('diagnostic-trees')
  trees(@Req() req: AuthenticatedRequest) {
    return this.learning.listTrees(req.tenantContext);
  }

  @Get('diagnostic-trees/:id')
  tree(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.learning.tree(req.tenantContext, id);
  }
}
