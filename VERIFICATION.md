# Vérifications de la première version

Vérifications effectuées le 24 octobre 2026.

- `node scripts/check.mjs` : syntaxe des neuf modules et présence des trois dictionnaires validées.
- `node --test tests/game.test.mjs tests/http.test.mjs` : **19 tests réussis, 0 échec**.
- Le test HTTP lance un vrai serveur et ouvre quatre flux de joueurs authentifiés. Il vérifie les vues privées, les commandes autorisées, le refus des origines externes et l’inaccessibilité des dictionnaires/fichiers serveur.
- Parcours dans le navigateur : création du salon, trois joueurs qui rejoignent par invitation, choix des quatre rôles, personnalisation et sauvegarde des règles, lancement et votes des deux sages, transitions automatiques, pauses avant les deux orations, bonne réponse rouge saisie avec Entrée, cinq mauvaises réponses bleues, victoire rouge 1–0 et Rejouer avec scores remis à zéro.
- Console du navigateur : aucune erreur ni alerte lors du parcours.
- Contrôle visuel sur ordinateur : accueil, salon à quatre joueurs, modale des règles et victoire.
- **Limite de vérification mobile** : les règles CSS responsive sont présentes mais le changement de dimensions demandé au navigateur de vérification est resté sans effet (page toujours à 1280 × 720). Le rendu mobile réel reste donc à vérifier sur un téléphone ou dans les outils de développement du navigateur.
- Les jingles sont synthétisés ; le déclenchement est implémenté mais leur perception sonore n’a pas été vérifiée à l’oreille.

Le jeu n’a pas été déployé sur Internet. Les tests réseau concernent la machine locale. Les salons de cette version sont stockés en mémoire et ne survivent pas au redémarrage du serveur.

## Mélange du design historique et de la première version

- Logo cerveau d’origine et slogan « L’art de l’esquivation ! » réintégrés.
- Accueil clair, palette cyan/bleu/violet et salon ardoise ; typographie et suivi des trois phases conservés.
- Zone de jeu à gauche, équipes en dessous, score et historique à droite sur ordinateur.
- Ancien dossier Kenshou old laissé intact. Sauvegarde de l’interface précédente dans le dossier de travail kenshou-design-before.
- Vérification navigateur de l’accueil, de la création de salon, du choix du sage et de l’enregistrement des règles ; aucune erreur console sur ce parcours.
- Rendu du salon vérifié à 390 px de large, accueil à 320 px ; pas de débordement horizontal. La limite d’émulation mobile mentionnée plus haut a été levée en affichant le navigateur avant de changer ses dimensions.
- Vérification de syntaxe des dix modules et 19 tests réussis après intégration.
## Page des paramètres et agencement retenu

L’agencement retenu est celui de la première version (score supérieur, équipes à gauche, zone de jeu et historique à droite), avec la palette bleu/cyan/violet historique.

Vérifications de la page #parametres : sauvegarde puis actualisation des préférences (7 points, mots rares, 30 secondes et point pour chaque réussite), création du salon avec ces valeurs, modification par l’hôte à 5 points et affichage du nouvel objectif dans le salon. Un invité reçoit les règles à jour et tous ses champs sont en lecture seule. Le retour aux valeurs standard puis l’enregistrement ont été vérifiés ; les préférences de test ont été remises aux valeurs standard. Aucun avertissement ni erreur console sur ces parcours.

Page vérifiée sur ordinateur et à 390 px de large sans débordement horizontal. Vérification de syntaxe des dix modules et 19 tests métier/HTTP réussis après la modification.