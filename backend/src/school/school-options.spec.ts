import { schoolFees, schoolOptions, validateProgramAge, validateOptionsForClass } from './school-options';

describe('Options Oumouna Khadija', () => {
  it('accepte le transport unique et conserve les options décochées', () => {
    for (const transportZone of [1, null]) expect(schoolOptions({ transportZone, karate: false })).toEqual({ transportZone, karate: false });
  });
  it('rejette les valeurs et pièces inconnues', () => {
    for (const data of [{ transportZone: 2 }, { karate: 'true' }, { schoolItemsProvided: 'UNKNOWN' }, { healthNotes: 'x'.repeat(2001) }]) expect(() => schoolOptions(data)).toThrow();
  });
  it('accepte les pièces demandées par les fiches 2026-2027', () => {
    const items = 'BIRTH_CERTIFICATE,STUDENT_PHOTOS,VACCINATION_BOOK,BOARDING_KIT,SCHOOL_SUPPLIES';
    expect(schoolOptions({ schoolItemsProvided: items })).toEqual({ schoolItemsProvided: items });
  });
  it('permet d’effacer les renseignements privés', () => {
    expect(schoolOptions({ healthNotes: ' ', emergencyContactPhone: null })).toEqual({ healthNotes: null, emergencyContactPhone: null });
  });
  it('accepte une naissance passée et refuse une date future', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00Z'));
    expect(() => validateProgramAge('PRESCHOOL', '2023-10-05')).not.toThrow();
    expect(() => validateProgramAge('DAARA_BOARDING', '2020-10-05')).not.toThrow();
    expect(() => validateProgramAge('PRESCHOOL', '2027-01-01')).toThrow();
    jest.useRealTimers();
  });
  it('calcule les forfaits officiels sans intégrer les options mensuelles', () => {
    const preschool = { level: 'MS', program: 'PRESCHOOL', registrationFee: 43000, monthlyTuition: 12000 };
    const boarding = { level: 'TAHFIZ', program: 'DAARA_BOARDING', registrationFee: 160000, monthlyTuition: 91000 };
    expect(schoolFees({}, preschool)).toEqual({ registrationFee: 43000, monthlyTuition: 12000 });
    expect(schoolFees({ transportZone: 1 }, preschool)).toEqual({ registrationFee: 55000, monthlyTuition: 12000 });
    expect(schoolFees({ karate: true }, boarding)).toEqual({ registrationFee: 160000, monthlyTuition: 91000 });
  });
  it('applique les options uniquement au programme concerné', () => {
    const preschool = { level: 'MS', program: 'PRESCHOOL', registrationFee: 43000, monthlyTuition: 12000 };
    const boarding = { level: 'TAHFIZ', program: 'DAARA_BOARDING', registrationFee: 160000, monthlyTuition: 91000 };
    expect(() => validateOptionsForClass({ supplies: true }, preschool)).not.toThrow();
    expect(() => validateOptionsForClass({ supplies: true }, boarding)).toThrow('préscolaire');
    expect(() => validateOptionsForClass({ karate: true }, preschool)).toThrow('internat');
    expect(() => validateOptionsForClass({ karate: true }, boarding)).not.toThrow();
    expect(() => validateOptionsForClass({ fullDay: true }, preschool)).toThrow('pas proposée');
  });
});
