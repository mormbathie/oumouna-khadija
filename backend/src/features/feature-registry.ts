// Optional modules the administrator can switch on or off. The core (pupils, parents, classes,
// invoices, users) is always on. Data is never deleted: switching a module back on restores it.
// A new client request can ship as a new entry with `defaultEnabled: false`.
export type FeatureDefinition = { key: string; label: string; description: string; category: string; parent?: string; defaultEnabled: boolean };

export const FEATURES: FeatureDefinition[] = [
  { key: 'quranCircles', category: 'Scolarité', label: 'Halkhas coraniques', description: 'Groupes coraniques des élèves et affectation groupée.', defaultEnabled: true },
  { key: 'grades', category: 'Scolarité', label: 'Notes et bulletins', description: 'Saisie des notes et bulletins trimestriels.', defaultEnabled: true },
  { key: 'attendance', category: 'Présences', label: 'Présences des élèves', description: 'Appel en classe et scan des QR codes.', defaultEnabled: true },
  { key: 'staffAttendance', category: 'Présences', label: 'Pointage des enseignants', description: 'Badges et pointage des arrivées et départs du personnel.', defaultEnabled: true },
  { key: 'parentPortal', category: 'Familles', label: 'Espace parents', description: 'Accès des parents (connexion par numéro de téléphone) aux dossiers de leurs enfants.', defaultEnabled: true },
  { key: 'whatsapp', category: 'Familles', label: 'Messages WhatsApp', description: 'Liens WhatsApp vers les parents : absences, reçus, relances et annonces.', defaultEnabled: true },
  { key: 'boarding', category: 'Internat', label: 'Internat', description: 'Internes, chambres et lits.', defaultEnabled: true },
  { key: 'boarding.rollCall', parent: 'boarding', category: 'Internat', label: 'Appel du soir', description: 'Présence des internes le soir.', defaultEnabled: true },
  { key: 'boarding.leaves', parent: 'boarding', category: 'Internat', label: 'Sorties et visites', description: 'Sorties autorisées, retours et visites des parents.', defaultEnabled: true },
  { key: 'boarding.health', parent: 'boarding', category: 'Internat', label: 'Santé (infirmerie)', description: 'Passages à l’infirmerie et soins donnés.', defaultEnabled: true },
  { key: 'boarding.pocketMoney', parent: 'boarding', category: 'Internat', label: 'Argent de poche', description: 'Dépôts et retraits d’argent de poche des internes.', defaultEnabled: true },
  { key: 'activities', category: 'Comptabilité', label: 'Taekwondo et kimonos', description: 'Mensualités de taekwondo et ventes de kimonos.', defaultEnabled: true },
  { key: 'dataTransfer', category: 'Administration', label: 'Import / export Excel', description: 'Export complet et import de données au format Excel ou CSV.', defaultEnabled: true },
];

export const FEATURE_KEYS = new Set(FEATURES.map(feature => feature.key));
