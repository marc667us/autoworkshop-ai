import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TenantGuard, type AuthenticatedRequest } from '../auth/tenant.guard';
import { optionalText, requiredText, uuid, validatedBody } from '../common/validation/validated-body';
import { KnowledgeService } from './knowledge.service';

/**
 * Knowledge, technical tools and learning — slice 10 of `COMPLETION_PLAN.md`.
 *
 * ⚠️ WHO MAY WRITE IS DECIDED IN `KnowledgeService`. Reading is deliberately
 * open to every workshop role: a library nobody may open is not a library.
 *
 * ⚠️ THE VOCABULARIES BELOW MIRROR MIGRATION 048'S CHECK CONSTRAINTS,
 * duplicated on purpose — the database is the authority and refuses anything
 * else; this layer exists so the refusal reads as a sentence, not a 500.
 */

const CATEGORIES = [
  'general', 'diagnostic', 'repair', 'safety', 'equipment', 'customer_service',
] as const;
const DIAGRAM_KINDS = ['wiring', 'hydraulic', 'exploded_view', 'routing', 'other'] as const;
const SOURCES = ['own', 'licensed', 'licensed_pending'] as const;

/** Mirrors 048: one letter then four alphanumerics, e.g. P0300. */
const FAULT_CODE_RE = /^[A-Z][0-9A-Z]{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ArticleBody = z
  .object({
    title: requiredText(300),
    body: requiredText(50_000),
    category: z.enum(CATEGORIES).default('general'),
    faultCode: z.string().regex(FAULT_CODE_RE, 'a code like P0300').optional(),
  })
  .strict();

const ProcedureBody = z
  .object({
    title: requiredText(300),
    steps: requiredText(50_000),
    appliesTo: optionalText(300),
    estimatedMinutes: z.number().int().positive().max(10_000).optional(),
    safetyNotes: optionalText(10_000),
    requiresCertification: optionalText(200),
  })
  .strict();

const DiagramBody = z
  .object({
    title: requiredText(300),
    diagramKind: z.enum(DIAGRAM_KINDS).default('wiring'),
    appliesTo: optionalText(300),
    // Defaults to `own`. A default of `licensed` would let somebody assert a
    // licence by not choosing, which is the wrong direction for the one field
    // on this screen that has legal weight.
    source: z.enum(SOURCES).default('own'),
    licenceNote: optionalText(1000),
  })
  .strict();

const CourseBody = z
  .object({
    title: requiredText(300),
    description: optionalText(5000),
    provider: optionalText(200),
    durationMinutes: z.number().int().positive().max(100_000).optional(),
    grantsCertification: optionalText(200),
  })
  .strict();

const CertificationBody = z
  .object({
    userId: uuid(),
    name: requiredText(200),
    awardedOn: z.string().regex(DATE_RE, 'use YYYY-MM-DD'),
    expiresOn: z.string().regex(DATE_RE, 'use YYYY-MM-DD').optional(),
    reference: optionalText(200),
    courseId: uuid().optional(),
  })
  .strict()
  // The same rule migration 048 enforces, said in words the person can act on.
  .refine((v) => !v.expiresOn || v.expiresOn >= v.awardedOn, {
    message: 'A certification cannot expire before the day it was awarded.',
  });

@Controller('knowledge')
@UseGuards(TenantGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('fault-codes')
  listFaultCodes(@Req() req: AuthenticatedRequest, @Query('q') q?: string) {
    return this.knowledge.listFaultCodes(req.tenantContext, q);
  }

  @Get('articles')
  listArticles(@Req() req: AuthenticatedRequest) {
    return this.knowledge.listArticles(req.tenantContext);
  }

  @Post('articles')
  createArticle(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ArticleBody)) body: z.infer<typeof ArticleBody>,
  ) {
    return this.knowledge.createArticle(req.tenantContext, body);
  }

  @Get('procedures')
  listProcedures(@Req() req: AuthenticatedRequest) {
    return this.knowledge.listProcedures(req.tenantContext);
  }

  @Post('procedures')
  createProcedure(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(ProcedureBody)) body: z.infer<typeof ProcedureBody>,
  ) {
    return this.knowledge.createProcedure(req.tenantContext, body);
  }

  @Get('diagrams')
  listDiagrams(@Req() req: AuthenticatedRequest) {
    return this.knowledge.listDiagrams(req.tenantContext);
  }

  @Post('diagrams')
  createDiagram(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(DiagramBody)) body: z.infer<typeof DiagramBody>,
  ) {
    return this.knowledge.createDiagram(req.tenantContext, body);
  }

  @Get('courses')
  listCourses(@Req() req: AuthenticatedRequest) {
    return this.knowledge.listCourses(req.tenantContext);
  }

  @Post('courses')
  createCourse(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CourseBody)) body: z.infer<typeof CourseBody>,
  ) {
    return this.knowledge.createCourse(req.tenantContext, body);
  }

  @Get('certifications')
  listCertifications(@Req() req: AuthenticatedRequest) {
    return this.knowledge.listCertifications(req.tenantContext);
  }

  @Post('certifications')
  recordCertification(
    @Req() req: AuthenticatedRequest,
    @Body(validatedBody(CertificationBody)) body: z.infer<typeof CertificationBody>,
  ) {
    return this.knowledge.recordCertification(req.tenantContext, body);
  }
}
