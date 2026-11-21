# API du Cabinet Transparency

API NestJS du cabinet, avec PostgreSQL, Prisma et authentification JWT. Les routes de gestion sont protégées; seules l’authentification et la vérification d’état sont publiques.

## Préparation PostgreSQL (Windows)

1. Créez une base vide nommée `factura_rdc` dans PostgreSQL.
2. Copiez `.env.example` vers `.env` dans ce dossier.
3. Renseignez `DATABASE_URL` **directement dans ce fichier local** avec le nom d’utilisateur, le mot de passe et le port de votre PostgreSQL. Ne partagez pas le mot de passe dans le chat et ne commitez jamais `.env`.
4. Depuis ce dossier, installez les dépendances et initialisez la base :

```powershell
npm install
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
```

Le seed initialise le Cabinet Transparency SARL, les devises CDF/USD et le premier administrateur. Définissez `ADMIN_EMAIL` et un `ADMIN_PASSWORD` unique d’au moins 14 caractères dans l’environnement local avant de lancer le seed. Le seed réinitialise le mot de passe de cet administrateur à chaque exécution.

## Démarrage

```powershell
npm run start:dev
```

L’API locale utilise `http://localhost:3001/api` ; la documentation Swagger est disponible sur `/api/docs`. `FRONTEND_ORIGIN` limite les origines CORS. Les factures créées par l’API restent en brouillon : la certification ou transmission fiscale officielle n’est pas encore intégrée.

## Contrôles utiles

```powershell
npm run db:status
npm run db:deploy
npm run build
npm test -- --runInBand
```

## Déploiement

- **Frontend** : déployer le dossier racine comme projet Next.js sur Vercel et configurer `NEXT_PUBLIC_API_URL` avec l’URL publique de l’API suivie de `/api`.
- **API** : utiliser le Blueprint `render.yaml` avec le dossier racine du dépôt. Fournir l’URL Prisma Postgres dans `DATABASE_URL`, l’URL de production du frontend dans `FRONTEND_ORIGIN`, et un email/mot de passe administrateur forts dans les variables du service.
- Render génère automatiquement `JWT_SECRET` et `ADMIN_PASSWORD`. Le Blueprint utilise `service@ctrs.cd` comme identifiant administrateur. Lors du premier déploiement, exécutez le seed une seule fois pour initialiser le cabinet et créer le premier compte; les redémarrages suivants appliquent seulement les migrations versionnées puis lancent NestJS. Le seed ne remplace pas le mot de passe d’un compte déjà existant.
- Le build retire ensuite les dépendances de développement afin de réduire la taille du service déployé.
- Configurer les variables secrètes uniquement dans les tableaux de bord sécurisés des fournisseurs. Ne commitez aucun fichier `.env` et ne partagez pas les secrets dans le chat.

### Notification e-mail des OP

Chaque nouvelle OP est enregistrée « à examiner », puis l’API transmet un e-mail poli à `ligbakelo@yahoo.fr` avec le PDF de l’OP et l’état de besoin joint. L’OP reste en attente jusqu’à la décision enregistrée dans la plateforme. Gmail est le fournisseur par défaut : `GMAIL_USER` vaut `xenderhub@gmail.com`, `GMAIL_APP_PASSWORD` doit contenir un mot de passe d’application créé pour ce compte, et `OP_EMAIL_FROM` peut personnaliser le nom affiché mais doit garder la même adresse Gmail. Ne mettez jamais le mot de passe dans Git. Le compte Gmail doit autoriser SMTP sécurisé. Le point de terminaison super-admin `POST /api/platform-admin/payment-orders/resend-pending-emails` permet ensuite de renvoyer les OP en attente qui n’ont pas déjà reçu le courriel. Resend reste disponible avec `OP_EMAIL_PROVIDER=resend`, `RESEND_API_KEY` et une adresse `OP_EMAIL_FROM` appartenant à un domaine vérifié.

Le Blueprint est configuré temporairement sur Render Free à la demande du propriétaire. Ce niveau peut mettre le service en veille et n’est pas garanti pour un usage professionnel en production; passez à un plan adapté avant d’y traiter des données réelles. Les comptes Vercel Hobby peuvent être limités aux usages personnels/non commerciaux; vérifiez le plan applicable à votre cabinet.

### Connexion Gmail OAuth

Dans Paramètres, l’administrateur de la société peut connecter le compte Gmail utilisé pour transmettre les OP à l’Associé-Gérant. La validation OTP se déroule directement chez Google; l’application ne demande ni ne stocke ce code. Créez un client OAuth Google de type Application Web et autorisez la redirection `https://factura-rdc-api.onrender.com/api/mail-settings/google/callback`. Sur Render, configurez `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `EMAIL_TOKEN_ENCRYPTION_KEY` (clé aléatoire de 32 octets en base64), `GOOGLE_OAUTH_CALLBACK_URL` et `APP_WEB_URL`. Le jeton Gmail est chiffré en base de données. L’autorisation demandée est limitée à l’envoi des courriels.
