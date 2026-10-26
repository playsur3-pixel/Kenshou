# Kenshou

Jeu web de mots en temps réel, en français, pour **4 à 16 joueurs**. Deux équipes, un sage par équipe, des disciples, des mots à faire deviner et des mots piégés. Le vocal se fait séparément, par exemple sur Discord.

## Démarrer

Prérequis : **Node.js 22 ou version supérieure**. Aucune dépendance à installer et aucune compilation nécessaire.

```powershell
cd 'D:\Site Web\Kenshou'
node server/index.mjs
```

Ouvrir **http://localhost:3000**. Créer un salon, transmettre son code ou copier le lien d’invitation, puis choisir les équipes et rôles. Pour tester seul, ouvrir quatre onglets et rejoindre le même salon avec quatre pseudos. Chaque onglet conserve sa propre session.

Le serveur écoute sur toutes les interfaces par défaut. Sur le même réseau, les autres joueurs utilisent `http://ADRESSE-IP-DU-PC:3000` et **pas** `localhost`. L’accès dépend du pare-feu Windows. Pour jouer via Internet, il faut héberger ce serveur Node derrière HTTPS ; le lien localhost ne permet pas à des amis distants de se connecter.

Variables facultatives : `PORT` (3000) et `HOST` (0.0.0.0). Le fichier `.env.example` documente les valeurs ; il n’est pas chargé automatiquement. Exemple PowerShell : `$env:PORT='3001'; node server/index.mjs`.

## Fonctionnement implémenté

- Salon par code, invitation, pseudos uniques, rôles et équipes, statut de connexion.
- Une seule place de sage par équipe ; lancement avec un sage et au moins un disciple connectés dans chaque équipe. Tous les joueurs du salon doivent être affectés.
- Phase 1 simultanée : mot privé par équipe, votes modifiables à la majorité absolue. À deux par équipe, le sage décide. En cas d’absence de majorité à la fin du temps, le mot courant est retenu. **2 rerolls par défaut** donnent au maximum trois mots proposés, dont le dernier est imposé.
- Phase 2 automatique : ajout de pièges avec auteur, suppression par tout coéquipier, doublons et mot cible refusés, quota commun à l’équipe.
- Pause avant le sage rouge, puis pause avant le sage bleu. Le mot n’est révélé au sage actif qu’au lancement de son décompte.
- Propositions écrites des disciples actifs uniquement ; quotas partagés, historique visible, arrêt au succès, au temps écoulé ou au quota épuisé. Les doublons ne consomment pas d’essai.
- Signalement d’un piège par l’équipe adverse : arrêt du temps, acceptation ou annulation par l’un des deux sages, reprise après annulation si les joueurs sont connectés.
- Points attribués après les deux passages, option sans point si les deux équipes trouvent, victoire ou match nul à l’objectif, modal fermable et remise à zéro avec Rejouer.
- Réglages de tous les temps, quotas, objectif, égalité et dictionnaires. L’hôte les modifie avant la partie ; l’hôte et les sages peuvent jouer/mettre en pause.
- Reconnexion automatique dans le même onglet, pause si un joueur perd sa connexion, transfert de l’hôte à un joueur connecté.
- Sons originaux générés par Web Audio, démarrage de phase/manche et victoire, bouton muet mémorisé. L’audio s’active après une interaction avec la page, selon les règles du navigateur.

La comparaison ignore casse, accents, espaces superflus et différence entre apostrophe/tiret/espace. Elle ne transforme pas le singulier en pluriel et ne valide pas automatiquement les synonymes. Les pièges prononcés à l’oral sont signalés et arbitrés par les joueurs, sans reconnaissance vocale.

## Règles standard

| Réglage | Valeur |
| --- | --- |
| Choix du mot | 20 secondes |
| Mots piégés | 90 secondes |
| Oration | 120 secondes |
| Rerolls | 2 |
| Pièges | 6 par équipe |
| Propositions | 5 par équipe |
| Objectif | 3 points |
| Deux mots trouvés | Aucun point |
| Dictionnaires | Facile + moyen |

Les fichiers `src/words/facile.txt`, `moyen.txt` et `difficile.txt` contiennent les listes initiales, un mot par ligne. Le facile reste obligatoire. Ils sont chargés uniquement côté serveur et peuvent être enrichis ; redémarrer après modification.

## Architecture

```text
server/game.mjs          Machine d’état, autorisations, votes, timers, scores, vues privées
server/index.mjs         Serveur HTTP, événements temps réel, fichiers publics
public/app.js            Interface et interactions
public/hooks/useRoom.js  Session, commandes, reconnexion et flux temps réel
public/hooks/useTimer.js Affichage du temps synchronisé avec le serveur
public/hooks/useSound.js Signaux sonores originaux
public/style.css         Interface responsive et modales
src/words/               Dictionnaires privés du serveur
tests/                  Tests métier et intégration HTTP avec quatre connexions
```

Le temps réel utilise un flux HTTP SSE authentifié par joueur et des commandes HTTP, sans interrogation périodique de l’état. Toutes les transitions et limites sont décidées par le serveur ; il envoie des vues filtrées, jamais les secrets adverses au disciple actif. Les jetons de session ne figurent pas dans l’URL ni dans les listes de joueurs. Le navigateur ne reçoit pas les dictionnaires.

## Vérifier

```powershell
node scripts/check.mjs
node --test tests/game.test.mjs tests/http.test.mjs
```

Le projet propose également les raccourcis `npm start`, `npm run check` et `npm test` si npm est disponible.

## Limites de cette première version

Les salons vivent en mémoire : un redémarrage serveur efface les parties. Ils expirent après deux heures sans joueur connecté. Cette version est prévue pour un seul processus serveur. Un joueur ne peut pas rejoindre une partie déjà lancée ; il peut retrouver sa place en rechargeant son onglet, tant que sa session y est conservée. Sans cette session, la place n’est pas récupérable pendant la partie.

Un déploiement public durable devra prévoir l’exploitation HTTPS, le stockage partagé si plusieurs instances sont nécessaires et une politique de remplacement des joueurs absents. L’application ne fournit pas de service vocal.

## Sources sonores complémentaires

Les sons actuellement intégrés sont synthétisés par le code du projet, sans extrait téléchargé. Pour une direction audio plus riche, les packs officiels **Kenney Interface Sounds** et **Music Jingles** sont proposés sous licence CC0 :

- https://kenney.nl/assets/interface-sounds
- https://kenney.nl/assets/music-jingles
- https://kenney.nl/support (conditions d’utilisation des assets)

Aucun de ces packs n’est inclus dans cette version.

## Page des paramètres

Accessible depuis le bouton Paramètres de l’en-tête, le bouton Règles du salon ou directement sur `http://localhost:3000/#parametres`.

La page regroupe l’objectif de victoire (1, 3, 5, 7 ou 10 points), les points en cas de double réussite, les dictionnaires, les trois durées et les quotas par équipe. Un récapitulatif suit les modifications. Les mots courants restent obligatoires.

Depuis l’accueil, les préférences enregistrées sont mémorisées dans le navigateur et envoyées au serveur lors de la création du prochain salon. Dans un salon, les règles du salon sont prioritaires : seul l’hôte peut les enregistrer avant le lancement ; les invités les consultent en lecture seule. Les règles sont verrouillées pendant la partie. Le bouton de retour aux valeurs standard prépare les réglages initiaux ; cliquer sur Enregistrer pour les appliquer.

## Hébergement Netlify et Render

Voir [DEPLOIEMENT.md](DEPLOIEMENT.md). La commande de build est npm run build et le dossier publié est dist. Le serveur multijoueur est lancé séparément sur Render.

## Réveil du serveur à la création ou à la connexion

Un clic sur Créer un salon ou Rejoindre vérifie d’abord /api/health. Si le serveur tarde à répondre, le site affiche un état de réveil et le temps écoulé, puis ouvre le salon automatiquement quand le serveur est prêt. Une attente peut être annulée en conservant le pseudo. Après deux minutes sans réponse, le formulaire redevient disponible et affiche un message explicite.

Le contrôle de disponibilité est relancé si nécessaire, mais la commande de création est envoyée une seule fois. Le réveil est déclenché par l’action du joueur ; il ne s’agit pas d’un maintien permanent du service actif. Le contrôle /api/health applique la même autorisation d’origine que les autres routes.