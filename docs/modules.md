# Modules et fonctionnalités

Menu **Administration → Modules et fonctionnalités** (administrateur uniquement).

Chaque module optionnel a un interrupteur. Un module désactivé :

- disparaît des menus, des onglets et des boutons pour tous les utilisateurs ;
- est refusé par le serveur (message « Cette fonctionnalité est désactivée ») ;
- **ne perd aucune donnée** : en le réactivant, tout réapparaît.

Les sous-modules (par exemple l’argent de poche dans l’internat) se désactivent
seuls ou avec leur module parent. Chaque changement est inscrit au journal des
actions avec son auteur.

| Catégorie | Modules |
| --- | --- |
| Scolarité | Halkhas coraniques, Notes et bulletins |
| Présences | Présences des élèves (appel, scan QR), Pointage des enseignants |
| Familles | Espace parents (les comptes parents sont alors fermés), Messages WhatsApp |
| Internat | Internat, avec Appel du soir, Sorties et visites, Santé, Argent de poche |
| Comptabilité | Taekwondo et kimonos |
| Administration | Import / export Excel |

Le cœur du logiciel reste toujours actif : élèves et inscriptions, parents,
classes, factures et paiements, utilisateurs.

## Pour les développements futurs

Une nouvelle fonctionnalité s’ajoute dans `backend/src/features/feature-registry.ts`
(de préférence avec `defaultEnabled: false`), se protège côté serveur avec
`@RequireFeature('clé')` et se masque à l’écran avec `useFeatures().isEnabled('clé')`.
Elle peut ainsi être livrée éteinte et activée le jour où le client la souhaite.
