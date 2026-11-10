import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const registrationStates = ['ALL', 'PAID', 'PARTIAL', 'UNPAID', 'OUTSTANDING', 'NOT_INVOICED'];
export type RegistrationReportQuery = { academicYearId?: string; classroomId?: string; cycle?: string; fullDay?: string; status?: string; search?: string };
const classRank = (level: string) => { const n = level.toUpperCase().replace(/[^A-Z0-9]/g, ''); const order = ['PETITESECTION','PS','MOYENNESECTION','MS','GRANDESECTION','GS','CI','CP','CE1','CE2','CM1','CM2']; const i = order.indexOf(n); return i < 0 ? 999 : i; };
const cycleOf = (program?: string | null, level?: string | null) => /(PRESCOL|MATERNEL|PETITE|MOYENNE|GRANDE|\bPS\b|\bMS\b|\bGS\b)/.test(`${program || ''} ${level || ''}`.toUpperCase()) ? 'PRESCHOOL' : 'ELEMENTARY';
const csvSafe = (value: unknown) => { let text = String(value ?? ''); if (/^[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };

@Injectable()
export class RegistrationReportService {
  constructor(private readonly prisma: PrismaService) {}
  async report(query: RegistrationReportQuery) {
    for (const value of [query.academicYearId, query.classroomId, query.status, query.cycle, query.search]) if (value !== undefined && (typeof value !== 'string' || value.length > 150)) throw new BadRequestException('Filtre invalide.');
    if (query.fullDay !== undefined && !['true','false',''].includes(query.fullDay)) throw new BadRequestException('Filtre d’option invalide.');
    const status = query.status || 'ALL';
    if (!registrationStates.includes(status)) throw new BadRequestException('Filtre de règlement invalide.');
    if (query.cycle && !['PRESCHOOL','ELEMENTARY'].includes(query.cycle)) throw new BadRequestException('Cycle invalide.');
    return this.prisma.$transaction(async tx => {
      const year = query.academicYearId ? await tx.academicYear.findUnique({ where: { id: query.academicYearId } }) : await tx.academicYear.findFirst({ where: { isCurrent: true } });
      if (!year) throw new NotFoundException('Année scolaire introuvable.');
      const classes = await tx.classroom.findMany({ where: { academicYearId: year.id }, select: { id:true,name:true,level:true,program:true } });
      classes.sort((a,b) => classRank(a.level)-classRank(b.level) || a.name.localeCompare(b.name,'fr'));
      if (query.classroomId && !classes.some(c=>c.id===query.classroomId)) throw new BadRequestException('Classe étrangère à l’année sélectionnée.');
      const allowedClassIds = classes.filter(c=>!query.cycle || cycleOf(c.program,c.level)===query.cycle).map(c=>c.id);
      const search=query.search?.trim();
      const enrollments=await tx.enrollment.findMany({
        where:{ academicYearId:year.id,status:'REGISTERED',classroomId:query.classroomId?query.classroomId:{in:allowedClassIds},student:{
          ...(query.fullDay?{fullDay:query.fullDay==='true'}:{}),
          ...(search?{OR:[{firstName:{contains:search,mode:'insensitive'}},{lastName:{contains:search,mode:'insensitive'}},{matricule:{contains:search,mode:'insensitive'}},{schoolMatricule:{contains:search,mode:'insensitive'}}]}:{}),
        }},
        include:{classroom:{select:{id:true,name:true,level:true,program:true}},student:{select:{id:true,firstName:true,lastName:true,matricule:true,schoolMatricule:true,fullDay:true,invoices:{where:{academicYearId:year.id,type:'REGISTRATION',cancelledAt:null},select:{id:true,invoiceNumber:true,amount:true,balance:true,payments:{where:{cancelledAt:null},select:{amount:true,refunds:{select:{amount:true}}}}}}}}},
        orderBy:[{student:{lastName:'asc'}},{student:{firstName:'asc'}}],
      });
      const allRows=enrollments.map(enrollment=>{
        const s=enrollment.student;
        const invoiced=s.invoices.reduce((sum,i)=>sum+i.amount,0);
        const grossCollected=s.invoices.reduce((sum,i)=>sum+i.payments.reduce((a,p)=>a+p.amount,0),0);
        const refunds=s.invoices.reduce((sum,i)=>sum+i.payments.reduce((a,p)=>a+p.refunds.reduce((b,r)=>b+r.amount,0),0),0);
        const outstanding=s.invoices.reduce((sum,i)=>sum+Math.max(0,i.balance),0);
        const paymentCount=s.invoices.reduce((sum,i)=>sum+i.payments.length,0);
        const rowStatus=!s.invoices.length?'NOT_INVOICED':outstanding<=0?'PAID':paymentCount>0?'PARTIAL':'UNPAID';
        return {id:s.id,name:`${s.firstName} ${s.lastName}`,matricule:s.schoolMatricule||s.matricule,platformMatricule:s.matricule,classroomId:enrollment.classroom.id,classroom:enrollment.classroom.name,cycle:cycleOf(enrollment.classroom.program,enrollment.classroom.level),fullDay:s.fullDay,invoiced,grossCollected,refunds,netCollected:grossCollected-refunds,outstanding,status:rowStatus,invoiceCount:s.invoices.length,paymentCount,invoices:s.invoices};
      });
      const rows=allRows.filter(row=>status==='ALL'||(status==='OUTSTANDING'?['PARTIAL','UNPAID'].includes(row.status):row.status===status));
      const emptyTotals=()=>({students:0,studentsWithPayment:0,fullyPaid:0,invoiced:0,grossCollected:0,refunds:0,netCollected:0,outstanding:0,counts:{PAID:0,PARTIAL:0,UNPAID:0,NOT_INVOICED:0} as Record<string,number>});
      const add=(totals:ReturnType<typeof emptyTotals>,row:typeof rows[number])=>{totals.students++;if(row.paymentCount>0)totals.studentsWithPayment++;if(row.status==='PAID')totals.fullyPaid++;totals.invoiced+=row.invoiced;totals.grossCollected+=row.grossCollected;totals.refunds+=row.refunds;totals.netCollected+=row.netCollected;totals.outstanding+=row.outstanding;totals.counts[row.status]++;};
      const totals=emptyTotals();rows.forEach(row=>add(totals,row));
      const classRows=classes.filter(c=>allowedClassIds.includes(c.id)).map(c=>{const classTotals=emptyTotals();rows.filter(row=>row.classroomId===c.id).forEach(row=>add(classTotals,row));return{id:c.id,name:c.name,level:c.level,cycle:cycleOf(c.program,c.level),...classTotals};}).filter(row=>row.students>0||query.classroomId===row.id);
      return{academicYear:{id:year.id,name:year.name},classes:classes.map(c=>({...c,cycle:cycleOf(c.program,c.level)})),totals,classRows,rows};
    },{isolationLevel:'RepeatableRead'});
  }
  async export(query:RegistrationReportQuery,format:'csv'|'xlsx'){
    const report=await this.report(query);
    const headings=['Classe','Élèves inscrits','Élèves avec paiement','Soldés','Facturé','Encaissements bruts','Remboursements','Encaissements nets','Reste à payer'];
    const values=(row:any)=>[row.name,row.students,row.studentsWithPayment,row.fullyPaid,row.invoiced,row.grossCollected,row.refunds,row.netCollected,row.outstanding];
    if(format==='csv'){const lines=[headings.map(csvSafe).join(';'),...report.classRows.map(row=>values(row).map(csvSafe).join(';')),values({name:'TOTAL GÉNÉRAL',...report.totals}).map(csvSafe).join(';')];return{content:Buffer.from(`\uFEFF${lines.join('\r\n')}`,'utf8'),mime:'text/csv; charset=utf-8',extension:'csv'};}
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Inscriptions');
    const logoPath=join(process.cwd(),'src/data-transfer/assets/school-logo.png');if(existsSync(logoPath)){const imageId=workbook.addImage({filename:logoPath,extension:'png'});sheet.addImage(imageId,{tl:{col:0,row:0},ext:{width:72,height:72}});}
    sheet.mergeCells('B1:I1');sheet.getCell('B1').value='Institut Oumouna Khadija — Synthèse des inscriptions';sheet.mergeCells('B2:I2');sheet.getCell('B2').value=`Année scolaire : ${report.academicYear.name}`;
    sheet.getRow(4).values=headings;sheet.getRow(4).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6B5B22'}};
    report.classRows.forEach(row=>sheet.addRow(values(row)));const totalRow=sheet.addRow(values({name:'TOTAL GÉNÉRAL',...report.totals}));totalRow.font={bold:true};
    sheet.columns=[{width:24},...Array(3).fill({width:20}),...Array(5).fill({width:22})];for(let column=5;column<=9;column++)sheet.getColumn(column).numFmt='#,##0 "FCFA"';sheet.views=[{state:'frozen',ySplit:4}];sheet.autoFilter='A4:I4';
    return{content:Buffer.from(await workbook.xlsx.writeBuffer()),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',extension:'xlsx'};
  }
}
