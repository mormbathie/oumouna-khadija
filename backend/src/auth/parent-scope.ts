import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Parent accounts created from a parent record use a reserved, undeliverable address:
// Keycloak requires an email, but these parents sign in with their phone number.
export const PARENT_EMAIL_DOMAIN = 'parents.invalid';
export const isTechnicalParentEmail = (email: unknown) => String(email || '').toLowerCase().endsWith('@' + PARENT_EMAIL_DOMAIN);

type Reader = { user: { findUnique: (args: any) => Promise<{ parentId: string | null } | null> } };

/**
 * Students a parent account may see: the children of the parent record linked to the account,
 * or (older accounts) of the parent records carrying the account's verified email address.
 */
export async function parentStudentScope(prisma: Reader, requester: any): Promise<Prisma.StudentWhereInput> {
  const account = requester?.userId
    ? await prisma.user.findUnique({ where: { keycloakId: String(requester.userId) }, select: { parentId: true } })
    : null;
  if (account?.parentId) {
    return { OR: [{ parentId: account.parentId }, { guardians: { some: { parentId: account.parentId } } }] };
  }
  const email = String(requester?.email || '').trim();
  if (email && requester?.emailVerified === true && !isTechnicalParentEmail(email)) {
    return { OR: [
      { parent: { is: { email: { equals: email, mode: 'insensitive' } } } },
      { guardians: { some: { parent: { email: { equals: email, mode: 'insensitive' } } } } },
    ] };
  }
  throw new ForbiddenException('Vérifiez votre adresse e-mail ou demandez au secrétariat de rattacher votre compte à votre fiche parent.');
}
