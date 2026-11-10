import { RegistrationReportService } from './registration-report.service';

describe('Registration report accounting rules',()=>{
  const year={id:'year',name:'2026-2027'};
  const classroom={id:'class',name:'CP',level:'CP',program:'ELEMENTARY'};
  const student=(id:string,invoices:any[])=>({id,firstName:id,lastName:'Test',matricule:`OK-${id}`,schoolMatricule:null,fullDay:false,invoices});
  const enrollment=(id:string,invoices:any[])=>({classroom,student:student(id,invoices)});
  const invoice=(amount:number,balance:number,payments:any[])=>({id:Math.random().toString(),invoiceNumber:'FAC',amount,balance,payments});
  const payment=(amount:number,refunds:number[]=[])=>({amount,refunds:refunds.map(value=>({amount:value}))});
  const tx:any={
    academicYear:{findFirst:jest.fn().mockResolvedValue(year)},
    classroom:{findMany:jest.fn().mockResolvedValue([classroom])},
    enrollment:{findMany:jest.fn().mockResolvedValue([
      enrollment('partiel', [invoice(50000,30000,[payment(10000),payment(10000)])]),
      enrollment('solde', [invoice(50000,0,[payment(50000)])]),
      enrollment('rembourse', [invoice(50000,0,[payment(50000,[5000])])]),
      enrollment('sans-facture', []),
    ])},
  };
  const prisma:any={$transaction:jest.fn((callback:any)=>callback(tx))};
  it('counts a student once, cumulates payments and keeps refunds out of receivables',async()=>{
    const result=await new RegistrationReportService(prisma).report({});
    const partial=result.rows.find(row=>row.id==='partiel');
    const refunded=result.rows.find(row=>row.id==='rembourse');
    expect(partial).toEqual(expect.objectContaining({invoiced:50000,grossCollected:20000,netCollected:20000,outstanding:30000,status:'PARTIAL',paymentCount:2}));
    expect(refunded).toEqual(expect.objectContaining({grossCollected:50000,refunds:5000,netCollected:45000,outstanding:0,status:'PAID'}));
    expect(result.totals).toEqual(expect.objectContaining({students:4,studentsWithPayment:3,fullyPaid:2,invoiced:150000,grossCollected:120000,refunds:5000,netCollected:115000,outstanding:30000}));
    expect(result.classRows[0].students).toBe(result.totals.students);
  });
  it('distinguishes an uninvoiced student from an unpaid invoice',async()=>{
    const result=await new RegistrationReportService(prisma).report({});
    expect(result.rows.find(row=>row.id==='sans-facture')?.status).toBe('NOT_INVOICED');
    expect(result.totals.counts.NOT_INVOICED).toBe(1);
  });
});
