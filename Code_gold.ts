// --- ENUMS ---
enum Action {
    BUILD_TOWER, BUILD_MINE, BUILD_CASERNE, REPAIR_TOWER, 
    REPAIR_MINE, SELF_PROTECT, SELF_PROTECT_TOWER
}

enum UnitType { QUEEN = -1, KNIGHT = 0, ARCHER = 1, GIANT = 2 }

enum BarrackType { NONE = -1, MINE = 0, TOWER = 1, BARRACKS = 2 }

enum ArmyType { KNIGHT = 0, ARCHER = 1, GIANT = 2 }

interface Point { x: number; y: number; }

// --- CLASSES ---

class Unit implements Point {
    constructor(
        public x: number, public y: number, public owner: number,
        public type: UnitType, public health: number
    ) {}

    public distanceTo(p: Point): number {
        return Math.sqrt(Math.pow(p.x - this.x, 2) + Math.pow(p.y - this.y, 2));
    }

    public static getCost(type: ArmyType): number {
        if (type === ArmyType.KNIGHT) return 80;
        if (type === ArmyType.ARCHER) return 100;
        if (type === ArmyType.GIANT) return 140;
        return 0;
    }
}

class Site implements Point {
    public structureType: BarrackType = BarrackType.NONE;
    public owner: number = -1;
    public param1: number = -1; // Mine: rate, Tower: HP, Barracks: turns
    public param2: number = -1; // Tower: range, Barracks: armyType
    public goldRemaining: number = -1;
    public maxMineSize: number = -1;

    constructor(
        public id: number, public x: number, public y: number, public radius: number
    ) {}

    public distanceTo(p: Point): number {
        return Math.sqrt(Math.pow(p.x - this.x, 2) + Math.pow(p.y - this.y, 2));
    }

    // Logique de vérification de danger (tirée du C#)
    public isSafeToBuild(myQueen: Unit, allSites: Site[]): boolean {
        // Ne pas construire sur une tour ennemie active
        if (this.owner === 1 && this.structureType === BarrackType.TOWER && this.param2 > 100) return false;

        // Si la reine est faible, éviter les zones couvertes par des tours ennemies
        if (myQueen.health < 30) {
            for (const s of allSites) {
                if (s.owner === 1 && s.structureType === BarrackType.TOWER) {
                    if (s.distanceTo(this) < s.param2) return false;
                }
            }
        }
        return true;
    }
}

// --- LOGIQUE DE JEU ---

const sites: Site[] = [];
let myGold = 0;
let touchedSite = -1;

// Lecture initiale
const numSites = parseInt(readline());
for (let i = 0; i < numSites; i++) {
    const [id, x, y, radius] = readline().split(' ').map(Number);
    sites.push(new Site(id, x, y, radius));
}

// Boucle principale
while (true) {
    const [gold, touched] = readline().split(' ').map(Number);
    myGold = gold;
    touchedSite = touched;

    for (let i = 0; i < numSites; i++) {
        const [id, goldLeft, maxMine, struct, owner, p1, p2] = readline().split(' ').map(Number);
        const site = sites.find(s => s.id === id)!;
        site.goldRemaining = goldLeft;
        site.maxMineSize = maxMine;
        site.structureType = struct;
        site.owner = owner;
        site.param1 = p1;
        site.param2 = p2;
    }

    const numUnits = parseInt(readline());
    const units: Unit[] = [];
    let myQueen: Unit | null = null;
    let advQueen: Unit | null = null;

    for (let i = 0; i < numUnits; i++) {
        const [x, y, owner, type, hp] = readline().split(' ').map(Number);
        const u = new Unit(x, y, owner, type, hp);
        units.push(u);
        if (type === UnitType.QUEEN) {
            if (owner === 0) myQueen = u;
            else advQueen = u;
        }
    }

    if (!myQueen || !advQueen) continue;

    // --- STRATÉGIE ---

    // Calcul du danger environnant
    const enemies = units.filter(u => u.owner === 1 && u.type !== UnitType.QUEEN);
    const nearestEnemyDist = enemies.length > 0 ? myQueen.distanceTo(enemies.sort((a,b) => myQueen!.distanceTo(a) - myQueen!.distanceTo(b))[0]) : 2000;
    
    const myTowers = sites.filter(s => s.owner === 0 && s.structureType === BarrackType.TOWER);
    const myMines = sites.filter(s => s.owner === 0 && s.structureType === BarrackType.MINE);
    const myBarracks = sites.filter(s => s.owner === 0 && s.structureType === BarrackType.BARRACKS);

    // Détermination de la priorité
    let targetSite: Site | null = null;
    let buildCommand = "WAIT";

    // 1. Réparer les mines d'abord si possible
    const mineToRepair = myMines.find(m => m.param1 < m.maxMineSize);
    if (mineToRepair) {
        targetSite = mineToRepair;
        buildCommand = `BUILD ${targetSite.id} MINE`;
    } 
    // 2. Économie : Construire des mines jusqu'à en avoir 3
    else if (myMines.length < 3) {
        targetSite = sites
            .filter(s => s.owner === -1 && s.goldRemaining !== 0)
            .sort((a, b) => myQueen!.distanceTo(a) - myQueen!.distanceTo(b))[0];
        if (targetSite) buildCommand = `BUILD ${targetSite.id} MINE`;
    }
    // 3. Caserne : En avoir au moins une
    else if (myBarracks.length < 1) {
        targetSite = sites
            .filter(s => s.owner === -1)
            .sort((a, b) => myQueen!.distanceTo(a) - myQueen!.distanceTo(b))[0];
        if (targetSite) buildCommand = `BUILD ${targetSite.id} BARRACKS-KNIGHT`;
    }
    // 4. Défense : Construire des tours si l'ennemi approche
    else if (myTowers.length < 3 || nearestEnemyDist < 400) {
        targetSite = sites
            .filter(s => s.owner === -1 || (s.owner === 0 && s.structureType === BarrackType.TOWER && s.param1 < 600))
            .sort((a, b) => myQueen!.distanceTo(a) - myQueen!.distanceTo(b))[0];
        if (targetSite) buildCommand = `BUILD ${targetSite.id} TOWER`;
    }

    // --- SORTIE REINE ---
    // Si on a une cible mais qu'on ne la touche pas, MOVE est implicite dans BUILD
    // Mais on peut forcer un MOVE si on est en grand danger (fuite vers les tours)
    if (nearestEnemyDist < 100 && myTowers.length > 0) {
        const safeTower = myTowers[0];
        console.log(`MOVE ${safeTower.x} ${safeTower.y}`);
    } else {
        console.log(targetSite ? buildCommand : "WAIT");
    }

    // --- SORTIE ENTRAÎNEMENT ---
    const trainingList: number[] = [];
    let tempGold = myGold;
    
    // Priorité entraînement : Chevaliers
    const availableBarracks = myBarracks
        .filter(b => b.param1 === 0 && b.param2 === ArmyType.KNIGHT)
        .sort((a, b) => a.distanceTo(advQueen!) - b.distanceTo(advQueen!));

    for (const b of availableBarracks) {
        if (tempGold >= 80) {
            trainingList.push(b.id);
            tempGold -= 80;
        }
    }

    console.log(`TRAIN ${trainingList.join(' ')}`.trim());
}

declare function readline(): string;
