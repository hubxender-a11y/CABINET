# FACTURA RDC — Cabinet Transparency

Application de gestion des dossiers, honoraires, règlements et charges du cabinet comptable. Le frontend Next.js se trouve à la racine; l’API NestJS et le schéma PostgreSQL/Prisma sont dans [`backend`](./backend).

## Développement local

```powershell
npm install
npm run dev
```

Le frontend s’ouvre sur `http://localhost:3000`. Sans `NEXT_PUBLIC_API_URL`, l’interface reste en mode démonstration local. Pour travailler avec l’API, configurez `backend\.env` depuis [`backend/.env.example`](./backend/.env.example), initialisez PostgreSQL en suivant [`backend/README.md`](./backend/README.md), puis lancez `npm run start:dev` dans `backend`.

## Déploiement recommandé

Le frontend est déployé sur **Vercel**, l’API NestJS est prévue sur **Render**, et la base relationnelle de production a été créée sur **Prisma Postgres**. Le backend comporte une connexion par JWT, sans inscription publique, et exige les secrets de production.

1. Le dépôt GitHub `hubxender-a11y/CABINET` est public; le frontend est déjà déployé sur Vercel.
2. Gardez la chaîne PostgreSQL Prisma Postgres privée; configurez-la comme variable `DATABASE_URL` dans Render.
3. Créez le service Render en important le Blueprint [`render.yaml`](./render.yaml). Configurez les valeurs demandées dans le tableau de bord sécurisé. Render applique les migrations versionnées au démarrage.
4. Après le premier déploiement Render, définissez dans Vercel `NEXT_PUBLIC_API_URL` à l’adresse Render suivie de `/api`, puis redéployez le frontend. Dans Render, renseignez `FRONTEND_ORIGIN` avec l’URL Vercel de production.
5. Lancez une seule fois `npm run db:seed` dans un environnement sécurisé configuré avec `DATABASE_URL`, `ADMIN_EMAIL` et un `ADMIN_PASSWORD` unique d’au moins 14 caractères. Ce seed initialise le cabinet et le compte administrateur; il réinitialise ce mot de passe si relancé.

**Limites de l’essai :** le Blueprint utilise temporairement Render Free à la demande du propriétaire. Render Free peut mettre le service en veille et n’est pas garanti pour un usage professionnel en production. Vérifiez les limites actuelles et passez à un plan adapté avant d’y traiter des données réelles. Vercel Hobby peut également être limité aux usages personnels/non commerciaux; vérifiez le plan applicable au cabinet.

Ne commitez jamais de fichier `.env`, de mot de passe, de JWT secret ou de chaîne PostgreSQL. La certification fiscale officielle n’est pas encore intégrée.
