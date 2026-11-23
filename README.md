# ML-KEM Chat

Application pédagogique de messagerie fondée sur ML-KEM (FIPS 203), en un seul
serveur : backend NestJS et front React sont servis par le même processus.

```
backend/    NestJS (TypeScript) : comptes, clés publiques, messages, temps réel (en mémoire)
frontend/   React + Vite (TypeScript) : ML-KEM dans le navigateur, interface
```

## Lancement

```
cd backend
npm install
npm run build:all      # compile le front (vers backend/public), puis le backend
npm start              # http://localhost:3000
```

Pour tester : ouvrez deux fenêtres de navigation privée, créez deux comptes, générez
les clés dans l'un, encapsulez dans l'autre et envoyez le texte encapsulé.

## Ce que fait chaque partie

- Les clés privées restent dans IndexedDB, dans le navigateur. Le serveur ne reçoit
  que les clés publiques, les textes encapsulés et les messages.
- Les données du serveur sont perdues à son arrêt. Après un redémarrage, republier
  sa clé publique depuis la section ML-KEM.
- Les messages `TEXT` ne sont pas chiffrés.
