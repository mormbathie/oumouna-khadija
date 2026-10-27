import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXPORT_MARKER = 'OUMOUNA_KHADIJA_EXPORT_V1';
export const READ_ONLY_MODELS = ['Refund','StudentDeparture','CashClosing','PaymentInstallment','PaymentReminder','BusinessAudit'] as const;
export const TABLE_LABELS: Record<string,string> = {
  AcademicYear:'Années scolaires',Parent:'Parents et tuteurs',Subject:'Matières',Student:'Élèves',Classroom:'Classes',Enrollment:'Inscriptions',Grade:'Notes',ReportCard:'Bulletins',Invoice:'Factures',Payment:'Paiements',Attendance:'Présences élèves',StaffAttendance:'Pointage professeurs',SchoolHoliday:'Jours fériés',SchoolCalendarSettings:'Calendrier scolaire',StudentDocument:'Documents élèves',ParentDocument:'Documents parents',Refund:'Remboursements',StudentDeparture:'Départs élèves',CashClosing:'Clôtures de caisse',PaymentInstallment:'Échéanciers',PaymentReminder:'Relances',BusinessAudit:'Journal des actions',
};
export const FIELD_LABELS: Record<string,string> = {
 schoolMatricule:'Matricule historique école',schoolEntryDate:'Date d’entrée dans l’établissement',originClass:'Classe d’origine',quranLevel:'Niveau du Coran',
 grossAmount:'Montant normal avant réduction',discountAmount:'Réduction accordée',discountType:'Type de réduction',discountReason:'Justification de la réduction',discountApprovedAt:'Réduction approuvée le',discountApprovedById:'Identifiant du directeur',discountApprovedByName:'Réduction approuvée par',discountRefundDue:'Trop-perçu à rembourser',discountRefundedAmount:'Trop-perçu remboursé',discountRefundedAt:'Remboursé le',discountRefundedById:'Identifiant du comptable',discountRefundedByName:'Remboursé par',
 id:'Identifiant',teacherId:'Identifiant professeur',date:'Date',status:'Situation',checkInAt:'Heure d’arrivée',checkOutAt:'Heure de départ',minutesLate:'Retard (minutes)',checkInById:'Identifiant agent arrivée',checkInByName:'Arrivée enregistrée par',checkOutById:'Identifiant agent départ',checkOutByName:'Départ enregistré par',reason:'Motif',createdAt:'Créé le',updatedAt:'Modifié le',name:'Nom',restDays:'Jours de repos',startTime:'Heure de début',timeZone:'Fuseau horaire',startDate:'Date de début',endDate:'Date de fin',isCurrent:'Année en cours',level:'Niveau',capacity:'Capacité',program:'Programme',monthlyTuition:'Mensualité',registrationFee:'Frais d’inscription',academicYearId:'Identifiant année scolaire',firstName:'Prénom',lastName:'Nom de famille',phone:'Téléphone',email:'Adresse e-mail',address:'Adresse',profession:'Profession',relation:'Lien avec l’élève',duplicateOverrideReason:'Motif de l’homonymie',matricule:'Matricule',dateOfBirth:'Date de naissance',placeOfBirth:'Lieu de naissance',gender:'Genre',transportZone:'Zone de transport',supplies:'Cantine',fullDay:'Journée continue',karate:'Taekwondo',eveningClasses:'Goûter',hairCare:'Soins capillaires et tresses',pharmacyKit:'Boîte à pharmacie',emergencyContactName:'Contact d’urgence',emergencyContactPhone:'Téléphone d’urgence',healthNotes:'Observations de santé',schoolItemsProvided:'Éléments fournis',bloodGroup:'Groupe sanguin',photoUrl:'Adresse de la photo',parentId:'Identifiant parent',createdById:'Identifiant créateur',createdByName:'Créé par',createdByRole:'Rôle du créateur',updatedById:'Identifiant modificateur',updatedByName:'Modifié par',studentId:'Identifiant élève',classroomId:'Identifiant classe',enrollmentDate:'Date d’inscription',remarks:'Observations',registeredById:'Identifiant agent inscription',registeredByName:'Inscrit par',registeredByRole:'Rôle de l’agent',code:'Code',coefficient:'Coefficient',subjectId:'Identifiant matière',term:'Trimestre',score:'Note obtenue',maxScore:'Note maximale',examType:'Type d’évaluation',overallAverage:'Moyenne générale',totalScore:'Total des notes',totalMaxScore:'Total maximal',totalCoeff:'Total des coefficients',rank:'Rang',classAverage:'Moyenne de la classe',minAverage:'Moyenne minimale',maxAverage:'Moyenne maximale',appreciation:'Appréciation',teacherRemarks:'Observation du professeur',directorRemarks:'Observation de la direction',generatedAt:'Généré le',invoiceNumber:'N° de facture',title:'Libellé',type:'Type',amount:'Montant',paidAmount:'Montant payé',balance:'Reste à payer',dueDate:'Échéance',cancelledAt:'Annulé le',cancellationReason:'Motif d’annulation',cancelledById:'Identifiant agent annulation',cancelledByName:'Annulé par',cancelledByRole:'Rôle de l’agent annulation',registrationOptions:'Options d’inscription',category:'Catégorie',billingKey:'Clé de facturation',paymentNumber:'N° de reçu',invoiceId:'Identifiant facture',paymentDate:'Date du paiement',paymentMethod:'Moyen de paiement',reference:'Référence',receivedBy:'Encaissé par',receivedById:'Identifiant agent encaissement',receivedByRole:'Rôle de l’agent encaissement',notes:'Notes complémentaires',justified:'Justifié',originalName:'Nom du document',mimeType:'Type de fichier',size:'Taille (octets)',storageKey:'Référence du document',action:'Action',entityId:'Identifiant de l’élément',actorId:'Identifiant auteur',actorName:'Auteur',actorRole:'Rôle de l’auteur',details:'Détails',day:'Journée',expectedCash:'Espèces attendues',countedCash:'Espèces comptées',difference:'Écart',summary:'Récapitulatif',error:'Erreur',sentAt:'Envoyé le',basePaidAmount:'Paiements antérieurs',departedOn:'Date du départ',requestKey:'Référence de demande',refundNumber:'N° de remboursement',paymentId:'Identifiant paiement',refundedOn:'Date du remboursement',recipient:'Bénéficiaire',mode:'Mode d’enregistrement',
};
export const ENUM_LABELS: Record<string,Record<string,string>> = {
 Gender:{MALE:'Garçon',FEMALE:'Fille'},StudentStatus:{ACTIVE:'Actif',INACTIVE:'Inactif',TRANSFERRED:'Transféré'},InvoiceStatus:{UNPAID:'Impayée',PARTIAL:'Partiellement payée',PAID:'Payée',OVERDUE:'En retard'},InvoiceType:{REGISTRATION:'Inscription',TUITION:'Scolarité',CANTEEN:'Cantine',UNIFORM:'Tenue',TRANSPORT:'Transport',OTHER:'Autre'},PaymentMethod:{CASH:'Espèces',WAVE:'Wave',ORANGE_MONEY:'Orange Money',BANK_TRANSFER:'Virement bancaire',CHECK:'Chèque'},AttendanceStatus:{PRESENT:'Présent',ABSENT:'Absent',LATE:'En retard',EXCUSED:'Excusé'},Term:{TRIMESTRE_1:'1er trimestre',TRIMESTRE_2:'2e trimestre',TRIMESTRE_3:'3e trimestre'},
};
export const REFERENCES: Record<string,{model:string;label:string;fields:string[]}> = {
 studentId:{model:'Student',label:'Élève (repère)',fields:['matricule','firstName','lastName']},parentId:{model:'Parent',label:'Parent (repère)',fields:['firstName','lastName']},teacherId:{model:'User',label:'Professeur (repère)',fields:['firstName','lastName']},classroomId:{model:'Classroom',label:'Classe (repère)',fields:['name']},academicYearId:{model:'AcademicYear',label:'Année scolaire (repère)',fields:['name']},subjectId:{model:'Subject',label:'Matière (repère)',fields:['code','name']},invoiceId:{model:'Invoice',label:'Facture (repère)',fields:['invoiceNumber','title']},paymentId:{model:'Payment',label:'Paiement (repère)',fields:['paymentNumber']},
};
export type ExportField = {name:string;type:string;kind:string;isId?:boolean};
export type ExportTable = {model:string;fields:ExportField[];rows:Record<string,any>[];references:Record<string,Map<string,string>>;readOnly:boolean};
const green='FF14532D',emerald='FF047857',muted='FF64748B',pale='FFECFDF5',border='FFDCE8E1';
const moneyFields=new Set(['monthlyTuition','registrationFee','amount','paidAmount','balance','expectedCash','countedCash','difference','basePaidAmount','grossAmount','discountAmount','discountRefundDue','discountRefundedAmount']);
const priority=['matricule','invoiceNumber','paymentNumber','refundNumber','name','firstName','lastName','title','code','date','paymentDate','refundedOn','departedOn','day','enrollmentDate','status','amount','paidAmount','balance'];
const technical=(f:ExportField)=>f.isId||f.name.endsWith('Id')||['billingKey','requestKey','storageKey'].includes(f.name);
const styleHeader={font:{name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}},fill:{type:'pattern' as const,pattern:'solid' as const,fgColor:{argb:green}},alignment:{vertical:'middle' as const,wrapText:true}};
function banner(sheet:ExcelJS.Worksheet,end:number,title:string,subtitle:string,imageId:number){
 sheet.addImage(imageId,{tl:{col:.1,row:.1},ext:{width:76,height:76}});
 for(const [row,text,height] of [[1,'INSTITUT OUMOUNA KHADIJA',30],[2,'Parcelles Assainies, Unité 25 — Dakar',22],[3,'77 433 05 08 / 70 707 43 64 · oumounakhadidja21@gmail.com',22],[4,title,30]] as const){sheet.mergeCells(row,2,row,end);const cell=sheet.getCell(row,2);cell.value=text;cell.font={name:'Calibri',size:row===1?15:row===4?17:10,bold:row===1||row===4,color:{argb:row===4?emerald:row===1?green:muted}};cell.alignment={vertical:'middle',wrapText:true};sheet.getRow(row).height=height;}
 sheet.mergeCells(5,1,5,end);sheet.getCell('A5').value=subtitle;sheet.getCell('A5').font={name:'Calibri',size:10,color:{argb:muted},italic:true};sheet.getRow(5).height=28;sheet.getCell('A5').alignment={wrapText:true,vertical:'middle'};
 sheet.properties.defaultRowHeight=22;
 sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:.3,right:.3,top:.4,bottom:.4,header:.15,footer:.15}};
 sheet.headerFooter={oddHeader:'&RInstitut Oumouna Khadija · Export confidentiel',oddFooter:'&Loumounakhadidja-academie.com&CUsage administratif&RPage &P / &N'};
}
function excelValue(field:ExportField,value:any){
 if(value===null||value===undefined)return null;
 if(field.type==='Boolean')return value?'Oui':'Non';
 if(field.kind==='enum')return ENUM_LABELS[field.type]?.[value] || value;
 return value;
}
export async function styledWorkbook(tables:ExportTable[],when=new Date()){
 const wb=new ExcelJS.Workbook();wb.creator='Institut Oumouna Khadija';wb.title='Données scolaires — Institut Oumouna Khadija';wb.subject='Export administratif';wb.company='Institut Oumouna Khadija';wb.created=when;wb.modified=when;
 const logo=wb.addImage({buffer:readFileSync(join(__dirname,'assets','school-logo.png')) as any,extension:'png'});
 const exported=new Intl.DateTimeFormat('fr-FR',{timeZone:'Africa/Dakar',dateStyle:'long',timeStyle:'short'}).format(when)+' — heure de Dakar';
 const cover=wb.addWorksheet('Sommaire',{properties:{tabColor:{argb:emerald}},views:[{showGridLines:false}]});
 cover.columns=[{width:12},{width:38},{width:20},{width:28},{width:30},{width:18}];
 banner(cover,6,'EXPORT DES DONNÉES SCOLAIRES',`${tables.length} tables · ${tables.reduce((n,t)=>n+t.rows.length,0).toLocaleString('fr-FR')} enregistrements · ${exported}`,logo);
 cover.getCell('A6').value=EXPORT_MARKER+'|INDEX';cover.getRow(6).hidden=true;
 cover.mergeCells('A7:F7');cover.getCell('A7').value='Cliquez sur une table pour ouvrir sa feuille.';cover.getCell('A7').font={name:'Calibri',size:11,color:{argb:emerald},bold:true};cover.getRow(7).height=28;
 const coverHeaders=['N°','Table','Enregistrements','Réimportation','Référence technique'];
 cover.getRow(8).values=coverHeaders;cover.getRow(8).height=28;for(let i=1;i<=5;i++)cover.getCell(8,i).style=styleHeader;
 for(const [index,table] of tables.entries()){
  const row=cover.getRow(9+index);row.values=[index+1,{text:TABLE_LABELS[table.model],hyperlink:`#'${TABLE_LABELS[table.model].replace(/'/g,"''")}'!A1`},table.rows.length,table.readOnly?'Consultation uniquement':'Importable',table.model];row.height=27;
  row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF6FAF8':'FFFFFFFF'}};cell.font={name:'Calibri',size:11,color:{argb:green}};cell.alignment={vertical:'middle'};});row.getCell(2).font={name:'Calibri',size:11,bold:true,color:{argb:emerald},underline:true};row.getCell(3).numFmt='#,##0';
 }
 const end=10+tables.length;cover.mergeCells(end,1,end,6);cover.getCell(end,1).value='LES DONNÉES SONT CONFIDENTIELLES — À partager uniquement avec les personnes autorisées.';cover.getCell(end,1).font={bold:true,size:10,color:{argb:green}};cover.getRow(end).height=30;
 for(const [i,text] of ['Les filtres et les en-têtes restent accessibles pendant le défilement. Les montants sont en F CFA.','Réimport : les identifiants et champs techniques sont conservés dans une ligne masquée. Ne supprimez pas les lignes d’en-tête.','Les colonnes « repère » facilitent la lecture ; elles ne remplacent pas les identifiants lors de l’import.','Les registres de remboursements, départs, caisse et audit sont réservés à la consultation et ignorés lors du réimport.','Les comptes, photos de profil, secrets, QR codes d’accès et fichiers joints ne sont pas inclus. Les références des documents sont exportées.'].entries()){cover.mergeCells(end+2+i,1,end+2+i,6);const cell=cover.getCell(end+2+i,1);cell.value=text;cell.font={name:'Calibri',size:10,color:{argb:muted}};cell.alignment={wrapText:true,vertical:'middle'};cover.getRow(end+2+i).height=30;}
 cover.pageSetup.orientation='portrait';cover.pageSetup.fitToHeight=1;
 cover.pageSetup.printArea=`A1:F${end+6}`;
 for(const table of tables){
  const fields=[...table.fields].sort((a,b)=>{const rank=(f:ExportField)=>technical(f)?1000:priority.includes(f.name)?priority.indexOf(f.name):100;return rank(a)-rank(b);});
  const columns:Array<{key:string;label:string;field?:ExportField;reference?:string}>=[...fields.filter(f=>priority.includes(f.name)&&!technical(f)).map(f=>({key:f.name,label:FIELD_LABELS[f.name]||f.name,field:f})),...Object.keys(table.references).map(key=>({key:'__info_'+key,label:REFERENCES[key].label,reference:key})),...fields.filter(f=>!priority.includes(f.name)||technical(f)).map(f=>({key:f.name,label:FIELD_LABELS[f.name]||f.name,field:f}))];
  const sheet=wb.addWorksheet(TABLE_LABELS[table.model],{properties:{tabColor:{argb:table.readOnly?'FFD97706':emerald}},views:[{state:'frozen',xSplit:Math.min(2,columns.length),ySplit:8,showGridLines:false,topLeftCell:'C9'}]});
  banner(sheet,Math.max(6,columns.length),TABLE_LABELS[table.model].toUpperCase(),`${table.rows.length.toLocaleString('fr-FR')} enregistrements · ${exported} · ${table.readOnly?'Consultation uniquement — non réimporté':'Fichier utilisable comme modèle d’import'}`,logo);
  sheet.getCell('A6').value=EXPORT_MARKER+'|'+(table.readOnly?'READONLY|':'TABLE|')+table.model;sheet.getRow(6).hidden=true;sheet.getRow(7).values=columns.map(c=>c.key);sheet.getRow(7).hidden=true;
  sheet.getRow(8).values=columns.map(c=>c.label);sheet.getRow(8).height=36;columns.forEach((c,i)=>{sheet.getCell(8,i+1).style=styleHeader;const sample=table.rows.slice(0,200).reduce((n,r)=>Math.max(n,String(c.reference?table.references[c.reference].get(r[c.reference])||'':r[c.key]??'').length),c.label.length);sheet.getColumn(i+1).width=c.reference?34:c.field?.type==='DateTime'?21:c.field&&technical(c.field)?38:Math.min(45,Math.max(15,sample+3));});
  for(const [index,record] of table.rows.entries()){
   const row=sheet.getRow(index+9);row.height=32;
   columns.forEach((column,i)=>{const cell=row.getCell(i+1);cell.value=column.reference?table.references[column.reference].get(record[column.reference])||null:excelValue(column.field!,record[column.key]);cell.font={name:'Calibri',size:column.field&&technical(column.field)?9:11,color:{argb:column.field&&technical(column.field)?muted:green}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF3F8F5':'FFFFFFFF'}};cell.border={bottom:{style:'hair',color:{argb:border}}};cell.alignment={vertical:'middle',wrapText:true};if(column.reference)cell.font={name:'Calibri',size:11,bold:true,color:{argb:emerald}};
    if(column.field?.type==='DateTime')cell.numFmt=['checkInAt','checkOutAt','createdAt','updatedAt','generatedAt','sentAt','cancelledAt'].includes(column.key)?'dd/mm/yyyy hh:mm:ss':'dd/mm/yyyy';
    else if(column.field&&moneyFields.has(column.key))cell.numFmt='#,##0" F CFA";[Red]-#,##0" F CFA"';
    else if(column.field&&['Float','Decimal'].includes(column.field.type))cell.numFmt='0.00';
    else if(column.field?.type==='Int')cell.numFmt='#,##0';
    else cell.numFmt='@';
   });
  }
  sheet.autoFilter={from:{row:8,column:1},to:{row:Math.max(8,table.rows.length+8),column:columns.length}};
  sheet.pageSetup.printTitlesRow='1:8';sheet.pageSetup.printArea=`A1:${sheet.getColumn(Math.max(columns.length,6)).letter}${Math.max(9,table.rows.length+8)}`;
  if(!table.rows.length){sheet.getCell('A9').note='Aucun enregistrement. Cette feuille peut servir de modèle ; saisir les données à partir de cette ligne.';}
 }
 return Buffer.from(await wb.xlsx.writeBuffer());
}
