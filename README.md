# FACTURA RDC — Cabinet Transparency

Application de gestion des dossiers, honoraires, règlements et charges du cabinet comptable. Le frontend Next.js se trouve à la racine; l’API NestJS et le schéma PostgreSQL/Prisma sont dans [`backend`](./backend).

## Développement local

```powershell
npm install
npm run dev
```

Le frontend s’ouvre sur `http://localhost:3000`. Sans `NEXT_PUBLIC_API_URL`, l’interface reste en mode démonstration local. Pour travailler avec l’API, configurez `backend\.env` depuis [`backend/.env.example`](./backend/.env.example), initialisez PostgreSQL en suivant [`backend/README.md`](./backend/README.md), puis lancez `npm run start:dev` dans `backend`.

## Déploiement recommandé

Le frontend est destiné à **Vercel**, l’API NestJS à **Render**, et les données relationnelles à **Neon PostgreSQL**. Le backend comporte une connexion par JWT, sans inscription publique, et exige les secrets de production.

1. Importez le dépôt GitHub privé `cabinet-transparency` dans Vercel et choisissez le dossier racine comme projet Next.js.
2. Créez PostgreSQL sur Neon; gardez la chaîne `DATABASE_URL` privée.
3. Créez le service Render en important le Blueprint [`render.yaml`](./render.yaml). Configurez les valeurs demandées dans le tableau de bord sécurisé. Render applique les migrations versionnées au démarrage.
4. Après le premier déploiement Render, définissez dans Vercel `NEXT_PUBLIC_API_URL` à l’adresse Render suivie de `/api`, puis redéployez le frontend. Dans Render, renseignez `FRONTEND_ORIGIN` avec l’URL Vercel de production.
5. Lancez une seule fois `npm run db:seed` dans un environnement sécurisé configuré avec `DATABASE_URL`, `ADMIN_EMAIL` et un `ADMIN_PASSWORD` unique d’au moins 14 caractères. Ce seed initialise le cabinet et le compte administrateur; il réinitialise ce mot de passe si relancé.

**Coûts et plans :** Render Free indique explicitement qu’il ne convient pas à la production et met en veille ses services; le Blueprint utilise donc une instance Starter payante. Vercel Hobby est réservé aux usages personnels/non commerciaux selon ses conditions; un cabinet doit vérifier et choisir le plan Vercel adapté avant la mise en service. Les prix et limites changent, vérifiez-les directement chez les fournisseurs.

Ne commitez jamais de fichier `.env`, de mot de passe, de JWT secret ou de chaîne PostgreSQL. La certification fiscale officielle n’est pas encore intégrée.
