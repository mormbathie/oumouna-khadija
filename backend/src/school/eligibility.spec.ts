import { validateOptionsForClass } from './school-options';

describe('Eligibilité des options Oumouna Khadija', () => {
  const preschool = { level: 'PS', program: 'PRESCHOOL', registrationFee: 43000, monthlyTuition: 12000 };
  const boarding = { level: 'TAHFIZ', program: 'DAARA_BOARDING', registrationFee: 160000, monthlyTuition: 91000 };
  it('réserve le taekwondo à l’internat', () => {
    expect(() => validateOptionsForClass({ karate: true }, preschool)).toThrow('internat');
    expect(() => validateOptionsForClass({ karate: true }, boarding)).not.toThrow();
  });
  it('réserve la cantine au préscolaire', () => {
    expect(() => validateOptionsForClass({ supplies: true }, boarding)).toThrow('préscolaire');
    expect(() => validateOptionsForClass({ supplies: true }, preschool)).not.toThrow();
  });
});
