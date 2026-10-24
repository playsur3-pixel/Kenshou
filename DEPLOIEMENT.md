# Déployer Kenshou sur Netlify et Render

Le site et le serveur sont deux services distincts. Netlify publie l’interface ; Render exécute le serveur Node qui conserve les salons et diffuse les événements en temps réel. Ils utilisent le même dépôt GitHub.

## 1. Publier le site Netlify

Dans le site Netlify relié à `playsur3-pixel/Kenshou` :

| Réglage | Valeur |
| --- | --- |
| Branche | `main` |
| Base directory | vide (racine du dépôt) |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node | `22`, déjà défini dans `netlify.toml` |

Le build crée `dist` à partir des seuls fichiers publics. Les dictionnaires et le code serveur ne sont pas publiés dans ce dossier. Le fichier `netlify.toml` fixe ces paramètres.

Un build sans `KENSHOU_API_URL` réussit et affiche un avertissement. L’interface est alors accessible mais elle explique que le serveur n’est pas configuré lorsqu’on essaie de créer ou rejoindre un salon. Il faut terminer les étapes suivantes.

Noter l’adresse HTTPS du site Netlify (ou du domaine personnel qui sera réellement utilisé pour jouer).

## 2. Créer le serveur Render

Dans Render : **New → Web Service**, connecter GitHub puis sélectionner `playsur3-pixel/Kenshou`.

| Réglage | Valeur |
| --- | --- |
| Branche | `main` |
| Root Directory | vide (racine du dépôt) |
| Language / Runtime | Node |
| Build Command | `node scripts/check.mjs` |
| Start Command | `node server/index.mjs` |
| Instance Type | Free, pour un premier essai |
| Health Check Path | `/api/health` |

Variables d’environnement :

| Nom | Valeur |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | L’adresse HTTPS exacte du site Netlify, sans slash final |

Exemple fictif : `ALLOWED_ORIGINS=https://mon-kenshou.netlify.app`. Si plusieurs domaines servent réellement le site, les séparer par des virgules ; ne pas ajouter les chemins ni un joker. Pour un domaine personnel, ajouter aussi son origine exacte.

Le dépôt contient également `render.yaml` pour une création via **Blueprint**. Il demande de renseigner `ALLOWED_ORIGINS`.

Déployer et attendre le statut **Live**. Render fournit alors une adresse HTTPS. Vérifier son chemin `/api/health` : il doit répondre avec `ok: true` et `app: "kenshou"`.

## 3. Relier Netlify au serveur

Dans les variables d’environnement du site Netlify, ajouter :

```text
KENSHOU_API_URL = l’adresse HTTPS du serveur Render
```

Exemple fictif : `https://kenshou-exemple.onrender.com`. Utiliser l’origine seule, sans chemin, identifiant ou mot de passe. Cette adresse est publique et intégrée au JavaScript lors du build.

Relancer le déploiement Netlify après cet ajout. Un changement de variable nécessite un nouveau build. Le journal doit indiquer `Serveur multijoueur : ...` avec l’adresse Render attendue.

## 4. Vérifier les salons

Ouvrir le site Netlify, créer un salon, puis ouvrir son lien dans un autre onglet ou sur un autre appareil. Les deux joueurs doivent apparaître dans le même salon. Le flux temps réel est connecté directement à Render ; aucune réécriture proxy Netlify n’est nécessaire.

Une erreur `Origine non autorisée` indique que `ALLOWED_ORIGINS` ne contient pas l’adresse exacte utilisée dans le navigateur. Une erreur indiquant que le serveur n’est pas configuré signifie que `KENSHOU_API_URL` manque dans le build Netlify, ou que le site n’a pas été redéployé depuis son ajout.

## Limites de cette version

Les salons vivent dans un seul processus serveur. Un redémarrage, une mise en veille ou un nouveau déploiement peut les effacer. Le service gratuit Render peut se mettre en veille ; le premier accès peut donc prendre plus de temps. Ne pas répartir les salons sur plusieurs instances tant qu’un stockage partagé n’a pas été ajouté.

Pour une installation plus simple, Render peut aussi servir l’application entière : ouvrir directement son adresse HTTPS, sans utiliser Netlify. Dans ce cas, les clients et le serveur partagent la même origine et la variable `KENSHOU_API_URL` n’intervient pas.

## Sources officielles

- [Render : services web Node et port du serveur](https://render.com/docs/web-services)
- [Render : premier déploiement et offre gratuite](https://render.com/docs/your-first-deploy)
- [Netlify : limites des proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)
