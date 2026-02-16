import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  GigRoleAssignmentStatus,
  GigRoleRequirementStatus,
  OfferResponse,
  OfferPolicy,
  PersonStatus,
  Prisma,
  RoleName,
  StaffRole
} from '@prisma/client';
import crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/types/auth-user';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../rbac/access.service';
import { ChangeLogService } from '../sync/change-log.service';
import { AssignManualDto } from './dto/assign-manual.dto';
import { OfferDecision } from './dto/respond-offer.dto';
import { UpsertGigRequirementsDto } from './dto/upsert-gig-requirements.dto';
import { CreatePersonDto, UpdatePersonDto } from './dto/upsert-person.dto';
import { UpdateMusicianProfileDto } from './dto/update-musician-profile.dto';
import { StaffingEmailService } from './staffing-email.service';
import { OfferTokenPayload, StaffingTokenService } from './staffing-token.service';

interface CascadeOfferResult {
  kind: 'offered';
  attemptId: string;
  requirementId: string;
  organisationId: string;
  bandId: string;
  role: StaffRole;
  personId: string;
  personName: string;
  personEmail: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventVenueName: string | null;
  expiresAt: Date;
  tokenPayload: OfferTokenPayload;
}

interface CascadeExhaustedResult {
  kind: 'exhausted';
  organisationId: string;
  bandId: string;
  requirementId: string;
  role: StaffRole;
  eventTitle: string;
}

interface CascadeIdleResult {
  kind: 'active' | 'filled' | 'paused' | 'missing';
}

type CascadeResult = CascadeOfferResult | CascadeExhaustedResult | CascadeIdleResult;

export interface RespondResult {
  status: 'accepted' | 'declined' | 'expired' | 'already_filled' | 'already_responded' | 'invalid_token';
  message: string;
}

interface RequirementScope {
  id: string;
  organisationId: string;
  bandId: string;
  role: StaffRole;
  quantity: number;
  status: GigRoleRequirementStatus;
  offersPaused: boolean;
  gig: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    venueName: string | null;
  };
}

@Injectable()
export class StaffingService {
  private readonly logger = new Logger(StaffingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly changeLog: ChangeLogService,
    private readonly audit: AuditService,
    private readonly email: StaffingEmailService,
    private readonly tokens: StaffingTokenService
  ) {}

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private apiBaseForLinks(): string {
    const trimmed = config.apiBaseUrl.replace(/\/$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  private appBaseForLinks(): string {
    return config.appUrl.replace(/\/$/, '');
  }

  private buildOfferLinks(token: string) {
    const encoded = encodeURIComponent(token);
    const apiBase = this.apiBaseForLinks();
    const appBase = this.appBaseForLinks();

    return {
      yesUrl: `${apiBase}/staffing/offers/respond/${encoded}/yes`,
      noUrl: `${apiBase}/staffing/offers/respond/${encoded}/no`,
      webYesUrl: `${appBase}/offers?offerToken=${encoded}&decision=YES`,
      webNoUrl: `${appBase}/offers?offerToken=${encoded}&decision=NO`
    };
  }

  private async getManagerEmails(organisationId: string, bandId: string): Promise<string[]> {
    const memberships = await this.prisma.bandMembership.findMany({
      where: {
        organisationId,
        bandId,
        roleName: {
          in: [RoleName.OWNER, RoleName.MANAGER]
        },
        deletedAt: null
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    });

    return Array.from(new Set(memberships.map((membership) => membership.user.email).filter(Boolean)));
  }

  private async loadRequirementScope(requirementId: string, organisationId: string): Promise<RequirementScope> {
    const requirement = await this.prisma.gigRoleRequirement.findFirst({
      where: {
        id: requirementId,
        organisationId,
        deletedAt: null
      },
      include: {
        gig: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            venueName: true
          }
        }
      }
    });

    if (!requirement) {
      throw new NotFoundException('Staffing requirement not found');
    }

    return requirement;
  }

  private async continueCascadeForRequirement(requirementId: string, organisationId: string): Promise<CascadeResult> {
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const requirement = await tx.gigRoleRequirement.findFirst({
        where: {
          id: requirementId,
          organisationId,
          deletedAt: null
        },
        include: {
          gig: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              venueName: true
            }
          },
          rankList: {
            where: { deletedAt: null },
            orderBy: { rank: 'asc' },
            include: {
              person: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  status: true,
                  deletedAt: true
                }
              }
            }
          },
          attempts: {
            orderBy: { attemptNo: 'asc' }
          },
          assignments: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!requirement) return { kind: 'missing' } as CascadeResult;
      if (requirement.offersPaused) return { kind: 'paused' } as CascadeResult;

      const confirmedAssignments = requirement.assignments.filter(
        (assignment) => assignment.assignmentStatus === GigRoleAssignmentStatus.CONFIRMED
      );

      if (confirmedAssignments.length >= requirement.quantity) {
        if (requirement.status !== GigRoleRequirementStatus.FILLED) {
          await tx.gigRoleRequirement.update({
            where: { id: requirement.id },
            data: { status: GigRoleRequirementStatus.FILLED }
          });
        }
        return { kind: 'filled' } as CascadeResult;
      }

      const activeAttempt = requirement.attempts.find((attempt) => !attempt.respondedAt && attempt.expiresAt > now);
      if (activeAttempt) {
        return { kind: 'active' } as CascadeResult;
      }

      const staleAttemptIds = requirement.attempts
        .filter((attempt) => !attempt.respondedAt && attempt.expiresAt <= now)
        .map((attempt) => attempt.id);

      if (staleAttemptIds.length > 0) {
        await tx.offerAttempt.updateMany({
          where: {
            id: { in: staleAttemptIds },
            respondedAt: null
          },
          data: {
            respondedAt: now,
            response: OfferResponse.NO
          }
        });

        await tx.gigRoleAssignment.updateMany({
          where: {
            requirementId: requirement.id,
            attemptId: { in: staleAttemptIds },
            assignmentStatus: GigRoleAssignmentStatus.OFFERED,
            deletedAt: null
          },
          data: {
            assignmentStatus: GigRoleAssignmentStatus.EXPIRED,
            respondedAt: now,
            conflictWarning: 'Offer expired without response'
          }
        });
      }

      const attemptedOrConfirmed = new Set<string>([
        ...confirmedAssignments.map((assignment) => assignment.personId),
        ...requirement.attempts
          .filter((attempt) => attempt.respondedAt || attempt.expiresAt <= now)
          .map((attempt) => attempt.personId)
      ]);

      const nextRank = requirement.rankList.find(
        (rank) =>
          rank.person.status === PersonStatus.ACTIVE &&
          !rank.person.deletedAt &&
          !attemptedOrConfirmed.has(rank.personId)
      );

      if (!nextRank) {
        await tx.gigRoleRequirement.update({
          where: { id: requirement.id },
          data: {
            status: GigRoleRequirementStatus.UNFILLED
          }
        });

        return {
          kind: 'exhausted',
          organisationId: requirement.organisationId,
          bandId: requirement.bandId,
          requirementId: requirement.id,
          role: requirement.role,
          eventTitle: requirement.gig.title
        } as CascadeExhaustedResult;
      }

      const attemptNo = Math.max(0, ...requirement.attempts.map((attempt) => attempt.attemptNo)) + 1;
      const expiresAt = new Date(now.getTime() + config.staffing.offerExpiryHours * 60 * 60 * 1000);
      const correlationToken = crypto.randomUUID();

      const createdAttempt = await tx.offerAttempt.create({
        data: {
          organisationId: requirement.organisationId,
          bandId: requirement.bandId,
          gigId: requirement.gigId,
          requirementId: requirement.id,
          role: requirement.role,
          personId: nextRank.personId,
          attemptNo,
          sentAt: now,
          expiresAt,
          correlationToken
        }
      });

      await tx.gigRoleAssignment.create({
        data: {
          organisationId: requirement.organisationId,
          bandId: requirement.bandId,
          gigId: requirement.gigId,
          requirementId: requirement.id,
          role: requirement.role,
          personId: nextRank.personId,
          attemptId: createdAttempt.id,
          assignmentStatus: GigRoleAssignmentStatus.OFFERED
        }
      });

      await tx.gigRoleRequirement.update({
        where: { id: requirement.id },
        data: {
          status: GigRoleRequirementStatus.OFFERING
        }
      });

      return {
        kind: 'offered',
        attemptId: createdAttempt.id,
        requirementId: requirement.id,
        organisationId: requirement.organisationId,
        bandId: requirement.bandId,
        role: requirement.role,
        personId: nextRank.personId,
        personName: nextRank.person.name,
        personEmail: nextRank.person.email,
        eventTitle: requirement.gig.title,
        eventStartsAt: requirement.gig.startsAt,
        eventVenueName: requirement.gig.venueName,
        expiresAt,
        tokenPayload: {
          attemptId: createdAttempt.id,
          personId: nextRank.personId,
          correlationToken,
          exp: Math.floor(expiresAt.getTime() / 1000)
        }
      } as CascadeOfferResult;
    });

    if (result.kind === 'offered') {
      const signedToken = this.tokens.signOfferToken(result.tokenPayload);
      const links = this.buildOfferLinks(signedToken);

      await this.email.sendOfferEmail({
        recipientName: result.personName,
        recipientEmail: result.personEmail,
        role: result.role,
        eventTitle: result.eventTitle,
        startsAt: result.eventStartsAt,
        venueName: result.eventVenueName,
        yesUrl: links.yesUrl,
        noUrl: links.noUrl,
        expiresAt: result.expiresAt
      });

      await this.changeLog.append({
        organisationId: result.organisationId,
        bandId: result.bandId,
        entityType: 'OFFER_ATTEMPT',
        entityId: result.attemptId,
        action: 'create',
        version: 1,
        payload: {
          requirementId: result.requirementId,
          personId: result.personId,
          role: result.role,
          expiresAt: result.expiresAt.toISOString(),
          webYesUrl: links.webYesUrl,
          webNoUrl: links.webNoUrl
        }
      });
    }

    if (result.kind === 'exhausted') {
      const managerEmails = await this.getManagerEmails(result.organisationId, result.bandId);
      await this.email.sendManagerAlert({
        to: managerEmails,
        subject: `StageOS staffing exhausted: ${result.role} for ${result.eventTitle}`,
        summary: `No candidate accepted for ${result.role}.`,
        details: `Requirement ${result.requirementId} is still unfilled after exhausting the ranked list.`
      });
    }

    return result;
  }

  private async markAttemptExpired(attemptId: string): Promise<boolean> {
    const now = new Date();

    const updated = await this.prisma.offerAttempt.updateMany({
      where: {
        id: attemptId,
        respondedAt: null,
        expiresAt: { lte: now }
      },
      data: {
        respondedAt: now,
        response: OfferResponse.NO
      }
    });

    if (updated.count === 0) {
      return false;
    }

    await this.prisma.gigRoleAssignment.updateMany({
      where: {
        attemptId,
        assignmentStatus: GigRoleAssignmentStatus.OFFERED,
        deletedAt: null
      },
      data: {
        assignmentStatus: GigRoleAssignmentStatus.EXPIRED,
        respondedAt: now,
        conflictWarning: 'Offer expired'
      }
    });

    return true;
  }

  private async respondToAttempt(attemptId: string, decision: OfferDecision, expectedPersonId?: string): Promise<RespondResult> {
    const attempt = await this.prisma.offerAttempt.findUnique({
      where: { id: attemptId },
      include: {
        person: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        requirement: {
          include: {
            gig: {
              select: {
                id: true,
                title: true,
                startsAt: true,
                endsAt: true,
                venueName: true
              }
            }
          }
        }
      }
    });

    if (!attempt) {
      return {
        status: 'invalid_token',
        message: 'Offer attempt not found.'
      };
    }

    if (expectedPersonId && attempt.personId !== expectedPersonId) {
      return {
        status: 'invalid_token',
        message: 'Offer token does not match recipient.'
      };
    }

    if (attempt.respondedAt) {
      return {
        status: 'already_responded',
        message: 'This offer has already been processed.'
      };
    }

    const now = new Date();

    if (attempt.expiresAt <= now) {
      const marked = await this.markAttemptExpired(attempt.id);
      if (marked) {
        await this.email.sendOfferExpired(attempt.person.email, attempt.requirement.gig.title, attempt.role);
        await this.continueCascadeForRequirement(attempt.requirementId, attempt.organisationId);
      }

      return {
        status: 'expired',
        message: 'This offer has expired.'
      };
    }

    if (decision === OfferDecision.NO) {
      const updated = await this.prisma.offerAttempt.updateMany({
        where: {
          id: attempt.id,
          respondedAt: null
        },
        data: {
          respondedAt: now,
          response: OfferResponse.NO
        }
      });

      if (updated.count === 0) {
        return {
          status: 'already_responded',
          message: 'This offer has already been processed.'
        };
      }

      await this.prisma.gigRoleAssignment.updateMany({
        where: {
          requirementId: attempt.requirementId,
          attemptId: attempt.id,
          assignmentStatus: GigRoleAssignmentStatus.OFFERED,
          deletedAt: null
        },
        data: {
          assignmentStatus: GigRoleAssignmentStatus.DECLINED,
          respondedAt: now
        }
      });

      await this.email.sendDeclinedConfirmation(attempt.person.email, attempt.requirement.gig.title, attempt.role);
      await this.continueCascadeForRequirement(attempt.requirementId, attempt.organisationId);

      return {
        status: 'declined',
        message: 'Decline recorded. The next candidate has been contacted.'
      };
    }

    const acceptResult = await this.prisma.$transaction(async (tx) => {
      const scopedAttempt = await tx.offerAttempt.findUnique({
        where: { id: attempt.id },
        include: {
          requirement: {
            include: {
              gig: {
                select: {
                  id: true,
                  title: true,
                  startsAt: true,
                  endsAt: true
                }
              }
            }
          },
          person: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });

      if (!scopedAttempt || scopedAttempt.respondedAt) {
        return {
          status: 'already_responded' as const,
          eventTitle: scopedAttempt?.requirement.gig.title ?? attempt.requirement.gig.title,
          role: scopedAttempt?.role ?? attempt.role,
          personEmail: scopedAttempt?.person.email ?? attempt.person.email,
          organisationId: scopedAttempt?.organisationId ?? attempt.organisationId,
          bandId: scopedAttempt?.bandId ?? attempt.bandId,
          requirementId: scopedAttempt?.requirementId ?? attempt.requirementId,
          doubleBookingWarning: null as string | null,
          needsMoreOffers: false
        };
      }

      if (scopedAttempt.expiresAt <= now) {
        await tx.offerAttempt.update({
          where: { id: scopedAttempt.id },
          data: {
            respondedAt: now,
            response: OfferResponse.NO
          }
        });

        await tx.gigRoleAssignment.updateMany({
          where: {
            requirementId: scopedAttempt.requirementId,
            attemptId: scopedAttempt.id,
            assignmentStatus: GigRoleAssignmentStatus.OFFERED,
            deletedAt: null
          },
          data: {
            assignmentStatus: GigRoleAssignmentStatus.EXPIRED,
            respondedAt: now,
            conflictWarning: 'Offer expired'
          }
        });

        return {
          status: 'expired' as const,
          eventTitle: scopedAttempt.requirement.gig.title,
          role: scopedAttempt.role,
          personEmail: scopedAttempt.person.email,
          organisationId: scopedAttempt.organisationId,
          bandId: scopedAttempt.bandId,
          requirementId: scopedAttempt.requirementId,
          doubleBookingWarning: null as string | null,
          needsMoreOffers: true
        };
      }

      const markResponse = await tx.offerAttempt.updateMany({
        where: {
          id: scopedAttempt.id,
          respondedAt: null
        },
        data: {
          respondedAt: now,
          response: OfferResponse.YES
        }
      });

      if (markResponse.count === 0) {
        return {
          status: 'already_responded' as const,
          eventTitle: scopedAttempt.requirement.gig.title,
          role: scopedAttempt.role,
          personEmail: scopedAttempt.person.email,
          organisationId: scopedAttempt.organisationId,
          bandId: scopedAttempt.bandId,
          requirementId: scopedAttempt.requirementId,
          doubleBookingWarning: null as string | null,
          needsMoreOffers: false
        };
      }

      const confirmedCount = await tx.gigRoleAssignment.count({
        where: {
          requirementId: scopedAttempt.requirementId,
          assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
          deletedAt: null
        }
      });

      if (confirmedCount >= scopedAttempt.requirement.quantity) {
        await tx.gigRoleAssignment.updateMany({
          where: {
            requirementId: scopedAttempt.requirementId,
            attemptId: scopedAttempt.id,
            assignmentStatus: GigRoleAssignmentStatus.OFFERED,
            deletedAt: null
          },
          data: {
            assignmentStatus: GigRoleAssignmentStatus.DECLINED,
            respondedAt: now,
            conflictWarning: 'Role was already filled before acceptance'
          }
        });

        return {
          status: 'already_filled' as const,
          eventTitle: scopedAttempt.requirement.gig.title,
          role: scopedAttempt.role,
          personEmail: scopedAttempt.person.email,
          organisationId: scopedAttempt.organisationId,
          bandId: scopedAttempt.bandId,
          requirementId: scopedAttempt.requirementId,
          doubleBookingWarning: null as string | null,
          needsMoreOffers: false
        };
      }

      const overlappingAssignments = await tx.gigRoleAssignment.findMany({
        where: {
          personId: scopedAttempt.personId,
          assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
          gigId: { not: scopedAttempt.gigId },
          deletedAt: null,
          gig: {
            startsAt: { lt: scopedAttempt.requirement.gig.endsAt },
            endsAt: { gt: scopedAttempt.requirement.gig.startsAt },
            deletedAt: null
          }
        },
        include: {
          gig: {
            select: {
              title: true
            }
          }
        }
      });

      const warning = overlappingAssignments.length
        ? `Potential double-booking: ${overlappingAssignments.map((item) => item.gig.title).join(', ')}`
        : null;

      const updatedAssignments = await tx.gigRoleAssignment.updateMany({
        where: {
          requirementId: scopedAttempt.requirementId,
          attemptId: scopedAttempt.id,
          assignmentStatus: GigRoleAssignmentStatus.OFFERED,
          deletedAt: null
        },
        data: {
          assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
          respondedAt: now,
          conflictWarning: warning
        }
      });

      if (updatedAssignments.count === 0) {
        await tx.gigRoleAssignment.create({
          data: {
            organisationId: scopedAttempt.organisationId,
            bandId: scopedAttempt.bandId,
            gigId: scopedAttempt.gigId,
            requirementId: scopedAttempt.requirementId,
            role: scopedAttempt.role,
            personId: scopedAttempt.personId,
            attemptId: scopedAttempt.id,
            assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
            respondedAt: now,
            conflictWarning: warning
          }
        });
      }

      await tx.offerAttempt.updateMany({
        where: {
          requirementId: scopedAttempt.requirementId,
          id: { not: scopedAttempt.id },
          respondedAt: null
        },
        data: {
          respondedAt: now,
          response: OfferResponse.NO
        }
      });

      await tx.gigRoleAssignment.updateMany({
        where: {
          requirementId: scopedAttempt.requirementId,
          attemptId: { not: scopedAttempt.id },
          assignmentStatus: GigRoleAssignmentStatus.OFFERED,
          deletedAt: null
        },
        data: {
          assignmentStatus: GigRoleAssignmentStatus.EXPIRED,
          respondedAt: now,
          conflictWarning: 'Superseded by another accepted offer'
        }
      });

      const newConfirmedCount = await tx.gigRoleAssignment.count({
        where: {
          requirementId: scopedAttempt.requirementId,
          assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
          deletedAt: null
        }
      });

      const nextStatus =
        newConfirmedCount >= scopedAttempt.requirement.quantity
          ? GigRoleRequirementStatus.FILLED
          : GigRoleRequirementStatus.OFFERING;

      await tx.gigRoleRequirement.update({
        where: { id: scopedAttempt.requirementId },
        data: {
          status: nextStatus
        }
      });

      return {
        status: 'accepted' as const,
        eventTitle: scopedAttempt.requirement.gig.title,
        role: scopedAttempt.role,
        personEmail: scopedAttempt.person.email,
        organisationId: scopedAttempt.organisationId,
        bandId: scopedAttempt.bandId,
        requirementId: scopedAttempt.requirementId,
        doubleBookingWarning: warning,
        needsMoreOffers: nextStatus !== GigRoleRequirementStatus.FILLED
      };
    });

    if (acceptResult.status === 'accepted') {
      await this.email.sendAcceptedConfirmation(acceptResult.personEmail, acceptResult.eventTitle, acceptResult.role);

      const managers = await this.getManagerEmails(acceptResult.organisationId, acceptResult.bandId);
      await this.email.sendManagerAlert({
        to: managers,
        subject: `StageOS staffing filled: ${acceptResult.role} for ${acceptResult.eventTitle}`,
        summary: `Role ${acceptResult.role} was accepted and assigned.`,
        details: acceptResult.doubleBookingWarning ?? 'No overlap warnings reported.'
      });

      if (acceptResult.needsMoreOffers) {
        await this.continueCascadeForRequirement(acceptResult.requirementId, acceptResult.organisationId);
      }

      return {
        status: 'accepted',
        message: acceptResult.doubleBookingWarning
          ? `Accepted with warning: ${acceptResult.doubleBookingWarning}`
          : 'Accepted and assigned.'
      };
    }

    if (acceptResult.status === 'already_filled') {
      await this.email.sendRoleAlreadyFilled(acceptResult.personEmail, acceptResult.eventTitle, acceptResult.role);
      return {
        status: 'already_filled',
        message: 'Role already filled by another candidate.'
      };
    }

    if (acceptResult.status === 'expired') {
      await this.email.sendOfferExpired(acceptResult.personEmail, acceptResult.eventTitle, acceptResult.role);
      await this.continueCascadeForRequirement(acceptResult.requirementId, acceptResult.organisationId);
      return {
        status: 'expired',
        message: 'This offer expired before your response could be recorded.'
      };
    }

    return {
      status: 'already_responded',
      message: 'This offer has already been processed.'
    };
  }

  async listPersons(user: AuthUser, bandId: string) {
    await this.access.ensureBandAccess(user, bandId);

    return this.prisma.person.findMany({
      where: {
        organisationId: user.organisationId,
        bandId,
        deletedAt: null
      },
      orderBy: {
        name: 'asc'
      }
    });
  }

  async createPerson(user: AuthUser, dto: CreatePersonDto) {
    await this.access.ensureBandAccess(user, dto.bandId);

    const existing = await this.prisma.person.findFirst({
      where: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        email: dto.email,
        deletedAt: null
      }
    });

    if (existing) {
      throw new ConflictException('Person with this email already exists for the band');
    }

    const linkedUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true }
    });

    const created = await this.prisma.person.create({
      data: {
        organisationId: user.organisationId,
        bandId: dto.bandId,
        userId: linkedUser?.id ?? null,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        status: dto.status ?? PersonStatus.ACTIVE,
        roles: dto.roles ?? []
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.person.create',
      entityType: 'Person',
      entityId: created.id,
      diff: created
    });

    return created;
  }

  async updatePerson(user: AuthUser, personId: string, dto: UpdatePersonDto) {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!person) throw new NotFoundException('Person not found');

    await this.access.ensureBandAccess(user, person.bandId);

    if (dto.email && dto.email !== person.email) {
      const duplicate = await this.prisma.person.findFirst({
        where: {
          organisationId: user.organisationId,
          bandId: person.bandId,
          email: dto.email,
          deletedAt: null,
          id: { not: personId }
        }
      });

      if (duplicate) {
        throw new ConflictException('Another person already uses this email');
      }
    }

    const linkedUser = dto.email
      ? await this.prisma.user.findUnique({
          where: { email: dto.email },
          select: { id: true }
        })
      : undefined;

    const updated = await this.prisma.person.update({
      where: { id: personId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        status: dto.status,
        roles: dto.roles,
        availabilityPrefs:
          dto.availabilityPrefs === undefined
            ? undefined
            : ((dto.availabilityPrefs as Prisma.InputJsonValue) ?? Prisma.JsonNull),
        userId: linkedUser?.id
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.person.update',
      entityType: 'Person',
      entityId: updated.id,
      diff: { before: person, after: updated }
    });

    return updated;
  }

  async issuePersonEmailVerification(user: AuthUser, personId: string) {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        organisationId: user.organisationId,
        deletedAt: null
      }
    });

    if (!person) throw new NotFoundException('Person not found');
    await this.access.ensureBandAccess(user, person.bandId);

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.personEmailToken.create({
      data: {
        personId: person.id,
        tokenHash,
        expiresAt
      }
    });

    const verifyUrl = `${this.appBaseForLinks()}/offers?verifyToken=${encodeURIComponent(rawToken)}`;
    await this.email.sendManagerAlert({
      to: [person.email],
      subject: 'StageOS email verification',
      summary: 'Confirm your email for staffing offers.',
      details: `Open this link to verify your email:\n${verifyUrl}`
    });

    return {
      personId: person.id,
      expiresAt,
      verificationToken: config.isProd ? undefined : rawToken,
      verifyUrl
    };
  }

  async verifyPersonEmailTokenForUser(user: AuthUser, rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    const token = await this.prisma.personEmailToken.findFirst({
      where: {
        tokenHash,
        verifiedAt: null,
        expiresAt: { gt: now }
      },
      include: {
        person: true
      }
    });

    if (!token) {
      throw new BadRequestException('Verification token is invalid or expired');
    }

    if (token.person.userId && token.person.userId !== user.id) {
      throw new ConflictException('Token belongs to a different account');
    }

    if (!token.person.userId) {
      await this.prisma.person.update({
        where: { id: token.personId },
        data: { userId: user.id }
      });
    }

    await this.prisma.personEmailToken.update({
      where: { id: token.id },
      data: {
        verifiedAt: now
      }
    });

    await this.prisma.person.update({
      where: { id: token.personId },
      data: {
        emailVerifiedAt: now
      }
    });

    return {
      verified: true,
      personId: token.personId,
      verifiedAt: now
    };
  }

  async verifyPersonEmailTokenPublic(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    const token = await this.prisma.personEmailToken.findFirst({
      where: {
        tokenHash,
        verifiedAt: null,
        expiresAt: { gt: now }
      }
    });

    if (!token) {
      return {
        verified: false,
        message: 'Verification token is invalid or expired.'
      };
    }

    await this.prisma.personEmailToken.update({
      where: { id: token.id },
      data: {
        verifiedAt: now
      }
    });

    await this.prisma.person.update({
      where: { id: token.personId },
      data: {
        emailVerifiedAt: now
      }
    });

    return {
      verified: true,
      message: 'Email confirmed. You can now receive staffing offers.'
    };
  }

  async getGigStaffing(user: AuthUser, gigId: string) {
    const gig = await this.prisma.event.findFirst({
      where: {
        id: gigId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        bandId: true,
        venueName: true
      }
    });

    if (!gig) throw new NotFoundException('Gig not found');

    await this.access.ensureBandAccess(user, gig.bandId);

    const [requirements, people] = await this.prisma.$transaction([
      this.prisma.gigRoleRequirement.findMany({
        where: {
          organisationId: user.organisationId,
          gigId,
          deletedAt: null
        },
        include: {
          rankList: {
            where: { deletedAt: null },
            orderBy: { rank: 'asc' },
            include: {
              person: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  roles: true,
                  status: true,
                  deletedAt: true
                }
              }
            }
          },
          assignments: {
            where: { deletedAt: null },
            include: {
              person: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          },
          attempts: {
            include: {
              person: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            orderBy: { attemptNo: 'desc' }
          }
        },
        orderBy: { role: 'asc' }
      }),
      this.prisma.person.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: gig.bandId,
          deletedAt: null
        },
        orderBy: { name: 'asc' }
      })
    ]);

    return {
      gig,
      people,
      requirements: requirements.map((requirement) => {
        const confirmedAssignments = requirement.assignments.filter(
          (assignment) => assignment.assignmentStatus === GigRoleAssignmentStatus.CONFIRMED
        );
        const activeOffer = requirement.attempts.find((attempt) => !attempt.respondedAt && attempt.expiresAt > new Date());

        return {
          id: requirement.id,
          role: requirement.role,
          quantity: requirement.quantity,
          offerPolicy: requirement.offerPolicy,
          status: requirement.status,
          offersPaused: requirement.offersPaused,
          rankList: requirement.rankList.map((rank) => ({
            id: rank.id,
            rank: rank.rank,
            personId: rank.personId,
            person: rank.person
          })),
          assignments: requirement.assignments,
          attempts: requirement.attempts,
          activeOffer,
          confirmedAssignments
        };
      })
    };
  }

  async upsertGigRequirements(user: AuthUser, gigId: string, dto: UpsertGigRequirementsDto) {
    const gig = await this.prisma.event.findFirst({
      where: {
        id: gigId,
        organisationId: user.organisationId,
        deletedAt: null
      },
      select: {
        id: true,
        bandId: true
      }
    });

    if (!gig) throw new NotFoundException('Gig not found');

    await this.access.ensureBandAccess(user, gig.bandId);

    const duplicateRoles = dto.requirements
      .map((item) => item.role)
      .filter((role, index, all) => all.indexOf(role) !== index);

    if (duplicateRoles.length > 0) {
      throw new BadRequestException(`Duplicate role requirement detected: ${duplicateRoles.join(', ')}`);
    }

    const personIds = Array.from(new Set(dto.requirements.flatMap((item) => item.rankedPersonIds)));
    if (personIds.length > 0) {
      const validPeople = await this.prisma.person.findMany({
        where: {
          organisationId: user.organisationId,
          bandId: gig.bandId,
          id: { in: personIds },
          deletedAt: null,
          status: PersonStatus.ACTIVE
        },
        select: { id: true }
      });

      const validSet = new Set(validPeople.map((person) => person.id));
      const invalid = personIds.filter((id) => !validSet.has(id));
      if (invalid.length > 0) {
        throw new BadRequestException(`Rank list includes unknown or inactive people: ${invalid.join(', ')}`);
      }
    }

    const nextRoles = new Set(dto.requirements.map((item) => item.role));

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.gigRoleRequirement.findMany({
        where: {
          organisationId: user.organisationId,
          gigId,
          deletedAt: null
        },
        select: {
          id: true,
          role: true
        }
      });

      const toDelete = existing.filter((item) => !nextRoles.has(item.role)).map((item) => item.id);
      if (toDelete.length > 0) {
        await tx.gigRoleRequirement.deleteMany({
          where: {
            id: { in: toDelete }
          }
        });
      }

      for (const requirementInput of dto.requirements) {
        const requirement = await tx.gigRoleRequirement.upsert({
          where: {
            gigId_role: {
              gigId,
              role: requirementInput.role
            }
          },
          update: {
            quantity: requirementInput.quantity ?? 1,
            offerPolicy: requirementInput.offerPolicy ?? OfferPolicy.CASCADE,
            offersPaused: false,
            status: GigRoleRequirementStatus.UNFILLED,
            deletedAt: null
          },
          create: {
            organisationId: user.organisationId,
            bandId: gig.bandId,
            gigId,
            role: requirementInput.role,
            quantity: requirementInput.quantity ?? 1,
            offerPolicy: requirementInput.offerPolicy ?? OfferPolicy.CASCADE,
            status: GigRoleRequirementStatus.UNFILLED,
            offersPaused: false
          }
        });

        await tx.gigRoleRankList.deleteMany({
          where: {
            requirementId: requirement.id
          }
        });

        const deduped = Array.from(new Set(requirementInput.rankedPersonIds));
        if (deduped.length > 0) {
          await tx.gigRoleRankList.createMany({
            data: deduped.map((personId, index) => ({
              organisationId: user.organisationId,
              bandId: gig.bandId,
              requirementId: requirement.id,
              role: requirement.role,
              rank: index + 1,
              personId
            }))
          });
        }
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.requirements.upsert',
      entityType: 'Event',
      entityId: gigId,
      metadata: {
        requirementCount: dto.requirements.length
      }
    });

    return this.getGigStaffing(user, gigId);
  }

  async startOffers(user: AuthUser, requirementId: string) {
    const requirement = await this.loadRequirementScope(requirementId, user.organisationId);
    await this.access.ensureBandAccess(user, requirement.bandId);

    await this.prisma.gigRoleRequirement.update({
      where: { id: requirement.id },
      data: {
        offersPaused: false,
        status:
          requirement.status === GigRoleRequirementStatus.FILLED
            ? GigRoleRequirementStatus.FILLED
            : GigRoleRequirementStatus.UNFILLED
      }
    });

    const result = await this.continueCascadeForRequirement(requirement.id, user.organisationId);

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.offers.start',
      entityType: 'GigRoleRequirement',
      entityId: requirement.id,
      metadata: { result: result.kind }
    });

    return {
      ok: true,
      result: result.kind
    };
  }

  async pauseOffers(user: AuthUser, requirementId: string) {
    const requirement = await this.loadRequirementScope(requirementId, user.organisationId);
    await this.access.ensureBandAccess(user, requirement.bandId);

    await this.prisma.gigRoleRequirement.update({
      where: { id: requirement.id },
      data: {
        offersPaused: true,
        status:
          requirement.status === GigRoleRequirementStatus.FILLED
            ? GigRoleRequirementStatus.FILLED
            : GigRoleRequirementStatus.UNFILLED
      }
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.offers.pause',
      entityType: 'GigRoleRequirement',
      entityId: requirement.id
    });

    return { ok: true };
  }

  async skipCandidate(user: AuthUser, requirementId: string) {
    const requirement = await this.loadRequirementScope(requirementId, user.organisationId);
    await this.access.ensureBandAccess(user, requirement.bandId);

    const activeAttempt = await this.prisma.offerAttempt.findFirst({
      where: {
        requirementId,
        respondedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { attemptNo: 'desc' }
    });

    if (!activeAttempt) {
      throw new ConflictException('No active offer to skip');
    }

    await this.prisma.$transaction([
      this.prisma.offerAttempt.update({
        where: { id: activeAttempt.id },
        data: {
          respondedAt: new Date(),
          response: OfferResponse.NO
        }
      }),
      this.prisma.gigRoleAssignment.updateMany({
        where: {
          requirementId,
          attemptId: activeAttempt.id,
          assignmentStatus: GigRoleAssignmentStatus.OFFERED,
          deletedAt: null
        },
        data: {
          assignmentStatus: GigRoleAssignmentStatus.EXPIRED,
          respondedAt: new Date(),
          conflictWarning: 'Skipped by manager'
        }
      })
    ]);

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.offers.skip_candidate',
      entityType: 'OfferAttempt',
      entityId: activeAttempt.id
    });

    await this.continueCascadeForRequirement(requirementId, user.organisationId);

    return { ok: true };
  }

  async resendActiveOffer(user: AuthUser, requirementId: string) {
    const requirement = await this.loadRequirementScope(requirementId, user.organisationId);
    await this.access.ensureBandAccess(user, requirement.bandId);

    const attempt = await this.prisma.offerAttempt.findFirst({
      where: {
        requirementId,
        respondedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        requirement: {
          include: {
            gig: {
              select: {
                title: true,
                startsAt: true,
                venueName: true
              }
            }
          }
        }
      },
      orderBy: { attemptNo: 'desc' }
    });

    if (!attempt) {
      throw new ConflictException('No active offer to resend');
    }

    const tokenPayload: OfferTokenPayload = {
      attemptId: attempt.id,
      personId: attempt.personId,
      correlationToken: attempt.correlationToken,
      exp: Math.floor(attempt.expiresAt.getTime() / 1000)
    };

    const signedToken = this.tokens.signOfferToken(tokenPayload);
    const links = this.buildOfferLinks(signedToken);

    await this.email.sendOfferEmail({
      recipientName: attempt.person.name,
      recipientEmail: attempt.person.email,
      role: attempt.role,
      eventTitle: attempt.requirement.gig.title,
      startsAt: attempt.requirement.gig.startsAt,
      venueName: attempt.requirement.gig.venueName,
      yesUrl: links.yesUrl,
      noUrl: links.noUrl,
      expiresAt: attempt.expiresAt
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.offers.resend',
      entityType: 'OfferAttempt',
      entityId: attempt.id
    });

    return { ok: true, attemptId: attempt.id };
  }

  async assignManual(user: AuthUser, requirementId: string, dto: AssignManualDto) {
    const requirement = await this.loadRequirementScope(requirementId, user.organisationId);
    await this.access.ensureBandAccess(user, requirement.bandId);

    const person = await this.prisma.person.findFirst({
      where: {
        id: dto.personId,
        organisationId: user.organisationId,
        bandId: requirement.bandId,
        deletedAt: null,
        status: PersonStatus.ACTIVE
      }
    });

    if (!person) {
      throw new NotFoundException('Candidate not found in this band');
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.gigRoleAssignment.updateMany({
        where: {
          requirementId,
          assignmentStatus: GigRoleAssignmentStatus.OFFERED,
          deletedAt: null
        },
        data: {
          assignmentStatus: GigRoleAssignmentStatus.EXPIRED,
          respondedAt: now,
          conflictWarning: 'Superseded by manual assignment'
        }
      });

      await tx.offerAttempt.updateMany({
        where: {
          requirementId,
          respondedAt: null
        },
        data: {
          respondedAt: now,
          response: OfferResponse.NO
        }
      });

      const existingConfirmed = await tx.gigRoleAssignment.findFirst({
        where: {
          requirementId,
          personId: dto.personId,
          assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
          deletedAt: null
        }
      });

      if (!existingConfirmed) {
        await tx.gigRoleAssignment.create({
          data: {
            organisationId: requirement.organisationId,
            bandId: requirement.bandId,
            gigId: requirement.gig.id,
            requirementId: requirement.id,
            role: requirement.role,
            personId: dto.personId,
            assignmentStatus: GigRoleAssignmentStatus.CONFIRMED,
            respondedAt: now
          }
        });
      }

      await tx.gigRoleRequirement.update({
        where: { id: requirement.id },
        data: {
          status: GigRoleRequirementStatus.FILLED,
          offersPaused: true
        }
      });
    });

    const managerEmails = await this.getManagerEmails(requirement.organisationId, requirement.bandId);
    await this.email.sendManagerAlert({
      to: managerEmails,
      subject: `StageOS staffing manually assigned: ${requirement.role}`,
      summary: `${person.name} was manually assigned to ${requirement.role}.`,
      details: `Event: ${requirement.gig.title}`
    });

    await this.audit.log({
      organisationId: user.organisationId,
      actorId: user.id,
      action: 'staffing.assign.manual',
      entityType: 'GigRoleRequirement',
      entityId: requirement.id,
      metadata: {
        personId: dto.personId
      }
    });

    return { ok: true };
  }

  async respondToOfferToken(token: string, decision: OfferDecision): Promise<RespondResult> {
    const verification = this.tokens.verifyOfferToken(token);
    if (!verification.valid || !verification.payload) {
      return {
        status: 'invalid_token',
        message: 'Offer token is invalid.'
      };
    }

    const payload = verification.payload;
    if (Date.now() >= payload.exp * 1000) {
      const marked = await this.markAttemptExpired(payload.attemptId);
      if (marked) {
        const attempt = await this.prisma.offerAttempt.findUnique({
          where: { id: payload.attemptId },
          include: {
            requirement: { include: { gig: { select: { title: true } } } },
            person: { select: { email: true } }
          }
        });

        if (attempt) {
          await this.email.sendOfferExpired(attempt.person.email, attempt.requirement.gig.title, attempt.role);
          await this.continueCascadeForRequirement(attempt.requirementId, attempt.organisationId);
        }
      }

      return {
        status: 'expired',
        message: 'Offer token has expired.'
      };
    }

    const attempt = await this.prisma.offerAttempt.findUnique({
      where: { id: payload.attemptId }
    });

    if (!attempt) {
      return {
        status: 'invalid_token',
        message: 'Offer attempt not found.'
      };
    }

    if (attempt.personId !== payload.personId || attempt.correlationToken !== payload.correlationToken) {
      return {
        status: 'invalid_token',
        message: 'Offer token did not validate.'
      };
    }

    return this.respondToAttempt(attempt.id, decision, payload.personId);
  }

  async respondToOfferAsMusician(user: AuthUser, attemptId: string, decision: OfferDecision) {
    const attempt = await this.prisma.offerAttempt.findUnique({
      where: { id: attemptId },
      include: {
        person: {
          select: {
            id: true,
            userId: true
          }
        }
      }
    });

    if (!attempt || attempt.person.userId !== user.id || attempt.organisationId !== user.organisationId) {
      throw new NotFoundException('Offer not found for this musician');
    }

    return this.respondToAttempt(attempt.id, decision, attempt.personId);
  }

  async listMusicianOffers(user: AuthUser, bandId?: string) {
    const people = await this.prisma.person.findMany({
      where: {
        organisationId: user.organisationId,
        userId: user.id,
        deletedAt: null,
        ...(bandId ? { bandId } : {})
      },
      orderBy: { name: 'asc' }
    });

    const personIds = people.map((person) => person.id);

    if (personIds.length === 0) {
      return {
        profiles: [],
        pendingOffers: []
      };
    }

    const pendingOffers = await this.prisma.offerAttempt.findMany({
      where: {
        organisationId: user.organisationId,
        personId: { in: personIds },
        respondedAt: null,
        expiresAt: { gt: new Date() },
        requirement: {
          deletedAt: null
        },
        gig: {
          deletedAt: null
        }
      },
      include: {
        requirement: true,
        gig: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            venueName: true,
            address: true
          }
        },
        person: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { expiresAt: 'asc' }
    });

    return {
      profiles: people,
      pendingOffers
    };
  }

  async updateMusicianProfile(user: AuthUser, dto: UpdateMusicianProfileDto) {
    const person = await this.prisma.person.findFirst({
      where: {
        organisationId: user.organisationId,
        userId: user.id,
        id: dto.personId,
        deletedAt: null
      }
    }) ?? await this.prisma.person.findFirst({
      where: {
        organisationId: user.organisationId,
        userId: user.id,
        deletedAt: null
      }
    });

    if (!person) {
      throw new NotFoundException('No musician profile linked to this account');
    }

    const updated = await this.prisma.person.update({
      where: { id: person.id },
      data: {
        roles: dto.roles,
        availabilityPrefs:
          dto.availabilityPrefs === undefined
            ? undefined
            : ((dto.availabilityPrefs as Prisma.InputJsonValue) ?? Prisma.JsonNull)
      }
    });

    return updated;
  }

  @Cron('*/2 * * * *')
  async processExpiredOffers() {
    const now = new Date();
    const expired = await this.prisma.offerAttempt.findMany({
      where: {
        respondedAt: null,
        expiresAt: { lte: now }
      },
      select: {
        id: true,
        requirementId: true,
        organisationId: true,
        person: {
          select: {
            email: true
          }
        },
        requirement: {
          select: {
            gig: {
              select: {
                title: true
              }
            }
          }
        },
        role: true
      },
      take: 100
    });

    for (const attempt of expired) {
      try {
        const marked = await this.markAttemptExpired(attempt.id);
        if (!marked) continue;

        await this.email.sendOfferExpired(attempt.person.email, attempt.requirement.gig.title, attempt.role);
        await this.continueCascadeForRequirement(attempt.requirementId, attempt.organisationId);
      } catch (error) {
        this.logger.error(
          `Failed to process expired offer ${attempt.id}: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }
  }

  async getMusicianOfferResponseLink(user: AuthUser, attemptId: string) {
    const attempt = await this.prisma.offerAttempt.findUnique({
      where: { id: attemptId },
      include: {
        person: {
          select: {
            userId: true
          }
        }
      }
    });

    if (!attempt || attempt.person.userId !== user.id || attempt.organisationId !== user.organisationId) {
      throw new NotFoundException('Offer not found');
    }

    const tokenPayload: OfferTokenPayload = {
      attemptId: attempt.id,
      personId: attempt.personId,
      correlationToken: attempt.correlationToken,
      exp: Math.floor(attempt.expiresAt.getTime() / 1000)
    };

    const signedToken = this.tokens.signOfferToken(tokenPayload);
    return this.buildOfferLinks(signedToken);
  }
}
