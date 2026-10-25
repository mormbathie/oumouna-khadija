export const SCHOOL_MAIL = Symbol('SCHOOL_MAIL');
export const FINANCIAL_PDF = Symbol('FINANCIAL_PDF');

export interface MailSender {
  send(to: string, subject: string, text: string, attachments?: { filename: string; content: Buffer; contentType: string }[]): Promise<{ accepted: boolean }>;
}

export interface PdfCreator { create(invoice: any, payment?: any): Promise<Buffer>; }
