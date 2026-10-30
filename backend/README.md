# FACTURA RDC — API

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
- **API** : utiliser le Blueprint `render.yaml` avec le dossier racine du dépôt. Fournir l’URL Neon dans `DATABASE_URL`, l’URL de production du frontend dans `FRONTEND_ORIGIN`, et un email/mot de passe administrateur forts dans les variables du service.
- Render génère automatiquement `JWT_SECRET`. Le démarrage applique les migrations versionnées puis lance NestJS.
- Configurer les variables secrètes uniquement dans les tableaux de bord sécurisés des fournisseurs. Ne commitez aucun fichier `.env` et ne partagez pas les secrets dans le chat.

Le niveau Render Starter est payant. Confirmez le coût actuel chez Render avant de créer le service. Les comptes Vercel Hobby peuvent être limités aux usages personnels/non commerciaux; vérifiez le plan applicable à votre cabinet avant d’y héberger un usage professionnel.
