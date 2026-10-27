# HCI_Seat_booking — TactileSeat

Extension Chrome qui rend les plans de réservation de sièges (avion, bus, train, salle) accessibles aux personnes aveugles ou malvoyantes, via la synthèse vocale, le clavier et l'afficheur tactile Dot Pad.

```
Personne 1               Personne 2                 Personne 3
Extraction du site  ──►  Gemini → fichier .json ──►  Dot Pad + clavier + voix
```

## Organisation des fichiers

Chaque fichier a **un seul responsable** (indiqué en haut du fichier). On évite ainsi de modifier les mêmes lignes en même temps et d'avoir des conflits lors des pull requests.

```
backend/                      Serveur Python (FastAPI + Gemini)
  main.py                     P2  Routes de l'API (/process-seatmap)
  schemas.py                  P2  Format des données échangées
  vision.py                   P2  Analyse d'une capture d'écran avec Gemini
  prompts.py                  P2  Texte du prompt Gemini
  requirements.txt            P2

extension/
  manifest.json               COMMUN  Liste des fichiers chargés par Chrome
  background.js               P1  Capture d'écran de l'onglet

  content/                    Scripts injectés dans la page web (ordre défini dans manifest.json)
    state.js                  COMMUN  État partagé (curseur, matrice, langue)
    main.js                   COMMUN  Chef d'orchestre : extraction -> backend -> session
    dom-utils.js              P1  Recherche dans le Shadow DOM
    extract.js                P1  Détection des sièges et masquage des popups
    layout.js                 P1  Construction de la matrice (à terme : P2)
    backend-client.js         P2  Appel HTTP au backend
    i18n.js                   P3  Textes FR / EN / KO
    speech.js                 P3  Voix, sons, changement de langue
    overlay.js                P3  Curseur visuel et défilement
    actions.js                P3  Clic sur un siège, bouton de paiement
    navigation.js             P3  Touches du clavier
    dotpad-bridge.js          P3  Envoi de la matrice à la page Dot Pad

  dotpad/                     P3  Modules du Dot Pad
    dotpad-manager.js         P3  Connexion USB / Bluetooth via le SDK
    tactile-map.js            P3  Matrice -> picots -> données hexadécimales

  dotpad-page/                P3  Onglet qui garde la connexion au Dot Pad
  popup/                      COMMUN  Popup de l'extension
  sdk/                        SDK officiel Dot Pad (ne pas modifier)

demo/sitedemo.html            Site de démonstration pour les tests
```

Les fichiers marqués **COMMUN** sont modifiés en se concertant.

## Lancer le projet

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Pour l'analyse par capture d'écran, définir la clé Gemini dans la variable d'environnement `GEMINI_API_KEY` (ne jamais l'écrire dans le code).

### Extension
1. Ouvrir `chrome://extensions`, activer le **mode développeur**.
2. **Charger l'extension non empaquetée** → choisir le dossier `extension/`.
3. Après chaque modification ou changement de branche : bouton ↻ sur l'extension, puis F5 sur la page.

### Utilisation
1. Clic sur l'icône TactileSeat → **Ouvrir la page Dot Pad** (un onglet épinglé s'ouvre), puis **Connecter (USB)** ou **(Bluetooth)**. Garder cet onglet ouvert et revenir sur le site de réservation.
2. Sur la page de réservation : **Alt + S** pour analyser le plan.
3. Flèches pour se déplacer, Shift + flèches pour sauter au prochain siège libre, Entrée pour sélectionner, P pour payer, Alt + L pour changer de langue.
4. Boutons Panning gauche / droite du Dot Pad : section précédente / suivante.

## Motifs tactiles (Dot Pad)

Chaque case = 4 × 4 picots : un motif de 3 × 3, puis une ligne et une colonne vides pour séparer les sièges (1 picot d'espace). Les parois de l'avion (côté hublots) sont une ligne verticale continue à 1 picot des sièges, à gauche et à droite. Le Dot Pad affiche donc 10 rangées × 14 colonnes à la fois ; au-delà, le plan est découpé en sections.

| Code | Sens | Motif |
|---|---|---|
| 0 | Couloir / vide | rien |
| 1 | Siège libre | carré plein 3 × 3 (9 picots) |
| 2 | Siège occupé | diagonale (3 picots) |
| 3 | Siège sélectionné | carré creux (8 picots) |
| 4 | Repère (sortie, toilettes) | à définir (barre de 3 picots pour l'instant) |
| 5 | Structure (mur, scène) | ligne continue |
| — | Curseur | croix (5 picots, remplace le motif du siège) |

Les motifs se règlent dans `PATTERNS` (`extension/dotpad/tactile-map.js`). Si l'image de test (bouton dans la page Dot Pad) apparaît brouillée sur le Dot Pad, corriger `DOT_BITS` dans le même fichier.

## Règles Git

- Une branche par tâche : `feature/<sujet>` (ex. `feature/extraction-prix`).
- `git pull` avant de commencer, petits commits fréquents.
- Pull request vers `main`, relue par au moins une autre personne.
