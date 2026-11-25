import { UnauthorizedException } from '@nestjs/common';

export type ActingUser = { userId: string; username: string; firstName?: string; lastName?: string; roles?: string[] };

export function actorStamp(actor: ActingUser) {
  if (!actor?.userId || !actor?.username) throw new UnauthorizedException('Auteur de l’action introuvable.');
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.username;
  const role = ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'ENSEIGNANT', 'PARENT', 'CONTROLEUR_PRESENCE', 'SURVEILLANT_INTERNAT']
    .find((candidate) => actor.roles?.includes(candidate)) || 'UTILISATEUR';
  return { id: actor.userId, name, role };
}
