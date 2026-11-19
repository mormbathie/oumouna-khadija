import { NotificationsService } from './notifications.service';
import { amountText, messages, whatsappLink, whatsappNumber } from './whatsapp-templates';

describe('WhatsApp numbers and links', () => {
  it('accepts Senegalese mobiles in every usual notation', () => {
    for (const value of ['77 123 45 67', '771234567', '+221 77 123 45 67', '00221771234567', '221771234567']) {
      expect(whatsappNumber(value)).toBe('221771234567');
    }
  });

  it('rejects landlines, short numbers and local numbers without a country prefix', () => {
    for (const value of ['33 820 12 34', '12345', '', null, '0612345678', '+221 33 820 12 34']) expect(whatsappNumber(value)).toBeNull();
    expect(whatsappNumber('+33 6 12 34 56 78')).toBe('33612345678');
  });

  it('builds a free click-to-chat link with the encoded message', () => {
    const text = messages.payment('Awa Diop', 25000, 'Scolarité novembre', 'REC-1', 0);
    expect(amountText(1250000)).toBe('1 250 000');
    expect(text).toContain('25 000 F CFA pour Awa Diop');
    const url = whatsappLink('221771234567', text);
    expect(url.startsWith('https://wa.me/221771234567?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(text);
  });
});

describe('Parent WhatsApp messages', () => {
  const parent = (id: string, phone: string, extra: any = {}) => ({ id, firstName: 'P', lastName: id, relation: 'Parent', phone, whatsappPhone: null, whatsappOptOut: false, ...extra });

  it('links each distinct reachable parent once and shows who already contacted them', async () => {
    const prisma: any = {
      payment: { findUnique: jest.fn(async () => ({ id: 'pay', amount: 5000, paymentNumber: 'REC-1', cancelledAt: null,
        invoice: { cancelledAt: null, title: 'Scolarité', balance: 10000, student: { id: 'child', firstName: 'Awa', lastName: 'Diop' } } })) },
      student: { findMany: jest.fn(async () => [{ id: 'child', parent: parent('father', '77 111 11 11'), guardians: [
        { relation: 'Père', parent: parent('father', '77 111 11 11') }, { relation: 'Mère', parent: parent('mother', '+221781111111', { whatsappPhone: '76 222 22 22' }) },
        { relation: 'Oncle', parent: parent('uncle', '70 333 33 33', { whatsappOptOut: true }) }, { relation: 'Tante', parent: parent('landline', '33 820 00 00') }] }]) },
      whatsAppMessageLog: { findMany: jest.fn(async () => [{ dedupeKey: 'PAYMENT:pay:221771111111', openedAt: new Date('2026-11-19T10:00:00Z'), actorName: 'Fatou', openCount: 1 }]) },
    };
    const result = await new NotificationsService(prisma).payment('pay');
    expect(result.recipients.map(recipient => recipient.phone)).toEqual(['221771111111', '221762222222']);
    expect(result.recipients[0]).toEqual(expect.objectContaining({ lastOpenedBy: 'Fatou', openCount: 1 }));
    expect(result.recipients[1]).toEqual(expect.objectContaining({ relation: 'Mère', openCount: 0, lastOpenedAt: null }));
    expect(result.recipients[1].url).toContain('https://wa.me/221762222222?text=');
  });

  it('refuses a reminder for a paid or cancelled invoice', async () => {
    const prisma: any = { invoice: { findUnique: jest.fn(async () => ({ id: 'i', balance: 0, cancelledAt: null })) } };
    await expect(new NotificationsService(prisma).reminder('i')).rejects.toThrow('solde à payer');
  });

  it('records who opened a message and counts repeated openings', async () => {
    const prisma: any = { whatsAppMessageLog: { upsert: jest.fn(async () => ({})) } };
    const actor = { userId: 'u', username: 'fatou', firstName: 'Fatou', lastName: 'Diop', roles: ['COMPTABLE'] };
    await new NotificationsService(prisma).logOpened({ kind: 'REMINDER', referenceId: 'inv', phone: '221771234567', message: 'x' }, actor);
    expect(prisma.whatsAppMessageLog.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { dedupeKey: 'REMINDER:inv:221771234567' },
      create: expect.objectContaining({ actorName: 'Fatou Diop', actorRole: 'COMPTABLE', recipientPhone: '221771234567' }),
      update: expect.objectContaining({ openCount: { increment: 1 } }),
    }));
    await expect(new NotificationsService(prisma).logOpened({ kind: 'SPAM', phone: '221771234567' }, actor)).rejects.toThrow('Type de message invalide');
    await expect(new NotificationsService(prisma).logOpened({ kind: 'PAYMENT', phone: '12' }, actor)).rejects.toThrow('Numéro WhatsApp invalide');
  });
});
