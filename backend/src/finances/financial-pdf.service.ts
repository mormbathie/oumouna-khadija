import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

@Injectable()
export class FinancialPdfService {
  private money(value: number) { return `${Number(value || 0).toLocaleString('fr-FR')} F CFA`; }

  async create(invoice: any, payment?: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 48, info: { Title: payment ? `Reçu ${payment.paymentNumber}` : `Facture ${invoice.invoiceNumber}` } });
      const chunks: Buffer[] = [];
      document.on('data', chunk => chunks.push(Buffer.from(chunk)));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      const student = invoice.student || {}, parent = student.parent || {};
      document.fillColor('#59612f').fontSize(18).text('INSTITUT OUMOUNA KHADIJA', { align: 'center' });
      document.fillColor('#202617').fontSize(13).text(payment ? 'REÇU DE PAIEMENT' : 'FACTURE', { align: 'center' });
      document.moveDown(1.5).fontSize(10).fillColor('#333333');
      document.text(`Référence : ${payment?.paymentNumber || invoice.invoiceNumber}`);
      document.text(`Date : ${new Date(payment?.paymentDate || invoice.createdAt).toLocaleDateString('fr-FR')}`);
      document.moveDown().text(`Élève : ${student.firstName || ''} ${student.lastName || ''}`.trim());
      document.text(`Matricule : ${student.matricule || '—'}`);
      document.text(`Parent / payeur : ${`${parent.firstName || ''} ${parent.lastName || ''}`.trim() || '—'}`);
      document.moveDown().fontSize(11).text(invoice.title || 'Frais scolaires', { underline: true });
      document.moveDown(0.5).fontSize(10);
      if (invoice.discountAmount > 0) {
        document.text(`Montant normal : ${this.money(invoice.grossAmount || invoice.amount + invoice.discountAmount)}`);
        document.text(`${invoice.discountType === 'SOCIAL_CASE' ? 'Cas social' : 'Réduction accordée'} : -${this.money(invoice.discountAmount)}`);
        document.text(`Justification : ${invoice.discountReason || '—'}`);
        document.text(`Validée par : ${invoice.discountApprovedByName || 'Direction'}`);
        document.text(`Montant net facturé : ${this.money(invoice.amount)}`);
        if (invoice.discountRefundDue > invoice.discountRefundedAmount) document.text(`Trop-perçu à rendre au parent : ${this.money(invoice.discountRefundDue - invoice.discountRefundedAmount)}`);
        if (invoice.discountRefundedAmount > 0) document.text(`Trop-perçu remboursé : ${this.money(invoice.discountRefundedAmount)}${invoice.discountRefundedByName ? ` par ${invoice.discountRefundedByName}` : ''}`);
      }
      document.text(`Montant de la facture : ${this.money(invoice.amount)}`);
      if (payment) document.text(`Versement reçu : ${this.money(payment.amount)}`);
      document.text(`Total payé : ${this.money(invoice.paidAmount)}`);
      document.text(`Reste à payer : ${this.money(invoice.balance)}`);
      if (payment?.paymentMethod) document.text(`Mode de paiement : ${payment.paymentMethod}`);
      if (payment?.reference) document.text(`Référence du paiement : ${payment.reference}`);
      document.moveDown(2).fillColor('#59612f').text(payment ? 'Merci de conserver ce reçu comme justificatif de paiement.' : 'Cette facture ne constitue pas un reçu de paiement.', { align: 'center' });
      document.moveDown().fillColor('#666666').fontSize(8).text('Parcelles Assainies Unité 25 · Institut Oumouna Khadija', { align: 'center' });
      document.end();
    });
  }
}
