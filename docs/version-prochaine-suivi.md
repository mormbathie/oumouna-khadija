# Version — gestion et continuité de service

## Nouveautés pour l’école

- **Inscription** : un nom, une date de naissance et un parent similaires déclenchent un avertissement. Vérifiez le matricule existant. Un autre enfant homonyme peut être inscrit avec une justification, conservée avec l’identité de l’auteur. Les matricules attribués ne sont plus réutilisés après suppression.
- **Contrôle financier** : les paiements et factures peuvent être annulés avec un motif. Les écritures restent conservées. Annulez les paiements avant leur facture ; les encaissements et soldes affichés tiennent compte de ces annulations.
- **Caisse** : choisissez la journée, consultez les totaux par caissier et mode de paiement, puis saisissez les espèces réellement comptées. Le directeur ou l’administrateur valide ; un écart exige une explication. La journée clôturée ne permet plus de nouveaux paiements ni d’annulations sur ses encaissements.
- **Échéanciers** : répartissez le reste à payer d’une facture sur une à vingt-quatre échéances. Les paiements sont déduits des premières échéances. Revoyez le plan après une annulation de paiement ou un changement du montant de la facture.
- **Relances** : préparez le message, vérifiez le destinataire et validez l’envoi. Aucune relance automatique n’est envoyée aux familles. Une seule tentative par facture et par jour est autorisée ; un résultat non confirmé exige de vérifier la messagerie avant un nouvel essai.
- **Espace parents** : chaque parent utilise un compte avec une adresse vérifiée correspondant à sa fiche. Il voit ses enfants, leurs factures, reçus, notes, bulletins, présences et documents. Les autres familles restent inaccessibles.
- **Passage d’année** : préparez une nouvelle année et ses classes, choisissez les réinscriptions puis activez-la explicitement. Les années, inscriptions et factures précédentes restent conservées. Cette opération ne crée pas de factures automatiquement.

## Sauvegardes et alertes

Les copies externes utilisent un dossier **AsSakinaBackups** sur le Google Drive
connecté, avec chiffrement du contenu et des noms de fichiers par rclone crypt.
La copie est relue et vérifiée avant publication de son marqueur de réussite.
Le serveur conserve aussi les deux dernières sauvegardes locales complètes.
Les copies Google Drive ne sont pas supprimées automatiquement.

Une clé de récupération est enregistrée dans le fichier local privé
`deployment-backup-recovery.json`, exclu de Git. **Conservez une copie privée
hors du VPS** : sa perte empêcherait de déchiffrer les sauvegardes.
La connexion Google est dans `/etc/assakina-backup/rclone.conf` sur le VPS,
avec accès réservé à root. Aucun de ces secrets ne doit être committé.

Le test de restauration crée deux bases temporaires, recharge les sauvegardes,
vérifie les archives puis supprime uniquement ces bases temporaires. Il ne
restaure jamais par-dessus les bases de l’application.

Les alertes sont destinées à **mormbathie98@gmail.com**. Le contrôle toutes les
cinq minutes vérifie l’API HTTPS, les six services, la fraîcheur des sauvegardes,
les échecs des sauvegardes, l’espace disque et les erreurs HTTP 5xx dans SigNoz.
Une alerte répétée est limitée à une par heure ; un retour à la normale est
signalé. Une erreur d’envoi ne marque pas le message comme envoyé.

La configuration SMTP privée est réutilisée depuis la configuration existante
et montée en lecture seule dans l’API. Après changement du mot de passe SMTP,
relancer `deploy/configure-email.py` afin de maintenir les deux configurations.

rclone signale que son identifiant Google partagé doit être remplacé par un
identifiant propre : suivre la [procédure officielle](https://rclone.org/drive/#making-your-own-client-id)
pour éviter une interruption ultérieure de la connexion Drive.

## Vérification et déploiement

Les tests intégrés couvrent les doublons, les dérogations, les annulations
concurrentes, les échéanciers, les relances approuvées, les clôtures et le passage
d’année. La CI les exécute sur PostgreSQL isolé avant de publier les images.
Les tests de contrôle d’accès vérifient l’isolement des dossiers parent.
Les scénarios de démarrage, de santé et d’accès public défaillants vérifient
le retour automatique aux images précédentes sans supprimer les données.

Le déploiement exige une sauvegarde fraîche et utilise les deux images SHA
publiées. Un contrôle par empreintes vérifie que les lignes métier préexistantes
sont conservées. Les nouvelles lignes créées pendant la livraison sont admises.
Après validation, le nettoyage conserve les images actives, les deux images de
rollback et toutes les images utilisées par les autres services. Aucun volume
n’est supprimé.
