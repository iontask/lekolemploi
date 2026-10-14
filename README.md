# Emploi du Temps Pro — Générateur d'Emplois du Temps pour Établissements Scolaires

Application web moderne, performante et 100 % exécutée côté client pour la conception, l'optimisation, l'audit et la gestion d'emplois du temps scolaires (collèges, lycées).

---

## 🚀 Fonctionnalités Clés

1. **Solveur en 2 phases avec HiGHS WebAssembly & Web Worker** :
   - **Phase A (Heuristique « Difficiles d'abord »)** : Placement instantané (< 1 s) priorisant les professeurs à marge nulle, cours communs et matières à blocs.
   - **Phase B (Optimisation Mathématique MIP HiGHS)** : Résolution formelle CPLEX LP avec WebAssembly pour compacité maximale et score optimal.

2. **Moteur de Règles & Validation Formelle** :
   - **Règles dures** : 0 double-réservation enseignant ou classe, respect strict des disponibilités, blocs de 2 heures consécutives pour l'Arabe et l'Anglais, créneaux réservés par classe, plages interdites.
   - **Règles souples & Fonction objectif** : Pénalisation des journées surchargées (> 2 h / matière), détection des heures isolées, compacité matinées/début de semaine.

3. **Grille Interactive & Drag-and-Drop (dnd-kit)** :
   - Déplacement intuitif des cours avec prévisualisation des conflits en temps réel.
   - Vues multiples : par Classe, par Enseignant, par Matière et Vue Multi-Classes synchrone.
   - Verrouillage des créneaux, annulation/rétablissement (Undo/Redo), et export Excel multi-onglets (ExcelJS).

4. **Diagnostic d'Infaisabilité & Gestion des Contraintes** :
   - Contrôles pré-solveur instantanés (dépassement d'heures, marges critiques 0/1 h, surcharge de classe).
   - Rapport lisible en langage naturel et suggestions de relaxation automatique des contraintes souples.

5. **Gestion Multi-Projets & Sauvegarde Automatique** :
   - Persistance locale dans IndexedDB avec indicateur de sauvegarde en direct.
   - Export et import complets des projets au format `.json`.
   - Clonage de scénarios et comparaison de scores côte à côte (« What-If »).

---

## 🛠️ Stack Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS, Lucide Icons
- **Solveur MIP** : HiGHS (WebAssembly), Web Worker dédié
- **Drag-and-Drop** : `@dnd-kit/core`, `@dnd-kit/utilities`
- **Import / Export** : `exceljs` (feuilles stylisées, formules, bordures, couleurs)
- **Stockage Local** : IndexedDB natif
- **Tests Unitaires** : Vitest (55 tests unitaires validant règles, solveur 360 h, diagnostics et import/export)

---

## 🧪 Commandes Utiles

```bash
# Lancement de l'environnement de développement
npm run dev

# Exécution des tests unitaires et benchmarks
npm test

# Compilation pour la production
npm run build
```

---

## 📊 Jeu de Référence Officiel

- **28 enseignants**, **12 classes** (1APIC-1 à 2BACSE), **360 heures exactes**.
- **100 % des heures placées**, **0 conflit dur**, blocs Arabe/Anglais strictement respectés.
