export const school = {
  name: 'Institut Oumouna Khadija',
  shortName: 'Oumouna Khadija',
  tagline: 'Authenticité et Modernité',
  address: 'Parcelles Assainies, Unité 25 — Dakar',
  phones: ['77 433 05 08', '70 707 43 64'],
  email: 'oumounakhadidja21@gmail.com', website: 'oumounakhadidja-academie.com',
  logo: '/oumouna-khadija-logo.png', year: '2026/2027',
};
export type SchoolProgram = { id: string; label: string; hours: string; levels: string[]; registrationFee: number; monthlyTuition: number; minimumAge?: number; requiredItems: string[]; fees: [string, number][]; extraSupplies?: number };
const preschoolFees: [string, number][] = [['Droits d’inscription', 15000], ['Uniforme', 20000], ['Tenue de sport', 8000]];
const boardingFees: [string, number][] = [['Droits d’inscription', 80000], ['Uniforme', 25000], ['Lit et draps', 30000], ['Taekwondo', 5000], ['Goûter', 10000], ['Kimono', 10000]];
export const programs: SchoolProgram[] = [
  { id: 'PRESCHOOL', label: 'Préscolaire', hours: 'Lun–jeu 8h30–13h / 14h30–16h ; ven 8h–13h', levels: ['PS','MS','GS'], registrationFee: 43000, monthlyTuition: 12000, minimumAge: 3, requiredItems: ['BIRTH_CERTIFICATE','STUDENT_PHOTOS'], fees: preschoolFees },
  { id: 'DAARA_BOARDING', label: 'Internat Tahfiz', hours: 'Internat', levels: ['TAHFIZ'], registrationFee: 160000, monthlyTuition: 91000, minimumAge: 6, requiredItems: ['BIRTH_CERTIFICATE','STUDENT_PHOTOS','VACCINATION_BOOK','BOARDING_KIT'], fees: boardingFees },
  { id: 'FRANCO_ARAB_BOARDING', label: 'Internat franco-arabe', hours: 'Internat', levels: ['CI','CP','CE1','CE2','CM1','CM2'], registrationFee: 160000, monthlyTuition: 91000, minimumAge: 6, requiredItems: ['BIRTH_CERTIFICATE','STUDENT_PHOTOS','VACCINATION_BOOK','BOARDING_KIT','SCHOOL_SUPPLIES'], fees: boardingFees },
];
export const itemLabels: Record<string,string> = { BIRTH_CERTIFICATE: 'Bulletin ou extrait de naissance', STUDENT_PHOTOS: 'Photos d’identité récentes', VACCINATION_BOOK: 'Carnet de vaccination à jour', BOARDING_KIT: 'Sac, trousseau et effets de toilette', SCHOOL_SUPPLIES: 'Fournitures scolaires' };
export const transportFees: Record<number,number> = { 1: 12000 };
export const programFor = (classroom?: {program?:string;level?:string}) => programs.find(p => p.id === classroom?.program) || programs[0];
export const money = (n: number) => new Intl.NumberFormat('fr-SN').format(n) + ' F CFA';

export function ageWarning(birth: string | Date, classroom?: {program?:string; level?:string}) {
  const min = programFor(classroom).minimumAge;
  if (!min || !birth) return false;
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - min);
  return new Date(birth) > cutoff;
}
export const effectiveFees = (student: {fullDay?:boolean;supplies?:boolean;karate?:boolean;eveningClasses?:boolean;hairCare?:boolean;pharmacyKit?:boolean;transportZone?:number|null}, classroom?: {program?:string;level?:string;registrationFee?:number;monthlyTuition?:number}) => {
  const plan = programFor(classroom);
  const base = student.fullDay && supportsFullDay(classroom)
    ? {registrationFee:isPreschool(classroom) ? 65000 : (classroom?.registrationFee === 40500 && classroom.level === 'CI' ? 40000 : classroom?.registrationFee ?? plan.registrationFee) + 25000,monthlyTuition:35000}
    : {registrationFee:classroom?.registrationFee ?? plan.registrationFee,monthlyTuition:classroom?.monthlyTuition ?? plan.monthlyTuition};
  const monthlyOptions=(transportFees[student.transportZone || 0] || 0)+(student.karate?4000:0)+(student.eveningClasses?10000:0)+(student.supplies&&isPreschool(classroom)?12000:0)+(student.hairCare?3000:0)+(student.pharmacyKit?2000:0);
  return { registrationFee: base.registrationFee + (student.eveningClasses&&isPreschool(classroom)?10000:0), monthlyTuition: base.monthlyTuition + monthlyOptions };
};

export const isPreschool = (classroom?: {program?:string;level?:string}) => classroom?.program==='PRESCHOOL' || ['PS','MS','GS'].includes(classroom?.level || '');

export const supportsFullDay = (_classroom?: {program?:string;level?:string}) => false;
