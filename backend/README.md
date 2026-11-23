# mlkem-chat-backend

Backend de la messagerie de démonstration ML-KEM. NestJS et TypeScript, **en mémoire** :
rien n'est persisté, toutes les données disparaissent à l'arrêt du serveur.

Le serveur ne fait aucun calcul ML-KEM. Il stocke les comptes, les **clés publiques**
(`ek`) et les messages, et transmet les notifications en temps réel. Les clés privées
restent dans le navigateur.

## Lancement

```
npm install
npm run build
npm start              # API et WebSocket sur http://localhost:3000
```

Variables facultatives (voir `.env.example`) : `PORT`, `CORS_ORIGIN`.

## Tests

Avec le serveur lancé :

```
npm run smoke          # API REST : comptes, clés, messages, contrôles d'erreur
node scripts/ws-check.mjs   # notification temps réel par WebSocket
```

## Routes

Toutes sauf `/health` et `/auth/login` exigent `Authorization: Bearer <jeton>`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | Vérification du serveur |
| POST | `/auth/login` | `{username, password, createIfMissing?}` → `{token, username, created}` |
| GET | `/me` | Profil de l'utilisateur connecté |
| PUT | `/me/public-key` | `{variant, ek}` (base64), publie la dernière clé publique |
| GET | `/users/:username` | Existence d'un utilisateur |
| GET | `/users/:username/public-key` | Dernière clé publique publiée |
| GET | `/conversations` | Contacts ayant au moins un message |
| GET | `/conversations/:username/messages` | Fil de messages avec un contact |
| POST | `/messages` | Envoi d'un message `TEXT` ou `KEM_CIPHERTEXT` |

Comportement de la connexion : si le compte n'existe pas, la réponse est
`409 USER_NOT_FOUND`. Le client demande confirmation, puis renvoie la requête avec
`createIfMissing: true`.

Envoi d'un texte encapsulé :

```json
{
  "to": "alice",
  "kind": "KEM_CIPHERTEXT",
  "body": "<c en base64>",
  "variant": "ML-KEM-768",
  "ekFingerprint": "<16 caractères hexadécimaux>"
}
```

Tailles contrôlées : `ek` = 800, 1184 ou 1568 octets ; `c` = 768, 1088 ou 1568 octets
selon la variante. Un texte `TEXT` fait au plus 2000 caractères.

## Temps réel

Connexion Socket.IO avec `auth: { token }`. Le serveur rejoint le client à la salle
`user:<nom>` et émet :

- `message.new` `{ id, from }` : un message vient d'arriver ;
- `conversation.updated` : la liste des conversations a changé.

Le contenu n'est jamais poussé : le client recharge via l'API REST.

## Limites connues

- Pas de persistance : redémarrer le serveur efface comptes, clés et messages.
- Sessions de 12 heures, sans renouvellement. Le jeton est opaque, stocké en mémoire.
- Après 10 échecs de connexion en 15 minutes, le compte est bloqué temporairement.
- Le serveur voit les expéditeurs, les destinataires et les horaires (métadonnées).
- Les messages `TEXT` ne sont pas chiffrés.
- Un texte encapsulé n'est vérifié que par sa taille, pas par sa validité.

## Front-end intégré

Le front React (dossier `../frontend`) est compilé dans `public/` et servi par ce
backend. Un seul processus suffit :

```
npm install
npm run build:all      # compile le front puis le backend
npm start              # http://localhost:3000
```

Développement du front seul : `npm run dev:front` (Vite sur le port 5173, appels
redirigés vers le port 3000).
