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

Chaque nouvelle OP est enregistrée « à examiner », puis l’API envoie un e-mail à `ligbakelo@yahoo.fr` avec le PDF de l’OP et l’état de besoin original en pièces jointes. L’approbation ou le rejet se fait dans la plateforme. L’administrateur de la société connecte son Gmail depuis **Paramètres → Connexion Gmail**; les codes de validation restent sur la page Google.

Pour activer la connexion OAuth, créez un client OAuth de type **Application Web** dans Google Cloud et autorisez cette URI de redirection : `https://factura-rdc-api.onrender.com/api/mail-settings/google/callback`. Ajoutez dans Render `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CALLBACK_URL`, `APP_WEB_URL=https://facture-rdc.vercel.app`, `EMAIL_TOKEN_ENCRYPTION_KEY` (clé aléatoire de 32 octets encodée en base64) et gardez `FRONTEND_ORIGIN=https://facture-rdc.vercel.app`. Générez la clé localement avec `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; ne la collez pas dans le chat. Le jeton de renouvellement Gmail est chiffré dans PostgreSQL avec cette clé. L’accès OAuth demandé est limité à l’envoi des e-mails.

Après la mise à jour de l’API et l’application de la migration, la connexion devient disponible pour l’administrateur de chaque société. Un e-mail de test est adressé au Gérant; les OP antérieures en échec peuvent ensuite être renvoyées depuis le registre. Si Google conserve l’application en mode test, ajoutez les comptes autorisés comme utilisateurs de test dans l’écran de consentement OAuth.

Le Blueprint est configuré temporairement sur Render Free à la demande du propriétaire. Ce niveau peut mettre le service en veille et n’est pas garanti pour un usage professionnel en production; passez à un plan adapté avant d’y traiter des données réelles. Les comptes Vercel Hobby peuvent être limités aux usages personnels/non commerciaux; vérifiez le plan applicable à votre cabinet.
