# Chambre.bj

Application de location immobilière au Bénin avec descriptions générées par IA.

## Démarrage local

```bash
npm install
npm run dev
```

## Variables d'environnement nécessaires

Créez un fichier `.env.local` avec :

```
VITE_SUPABASE_URL=https://wbignnitvwjgumwpcklg.supabase.co
VITE_SUPABASE_KEY=sb_publishable_27l-l5jdbMwfOlh1b06__w_ZiMibOLI
```

## Déploiement sur Vercel

1. Poussez ce projet sur GitHub
2. Allez sur vercel.com → "Add New Project" → importez le dépôt
3. Dans les paramètres, ajoutez les 2 variables d'environnement ci-dessus
4. Cliquez "Deploy"
