import { Athlete, WeightCategory, BracketModel, BracketNode, DuplicateGroup } from '../types';

export const NAME_KEYS = ['name', 'player', 'player name', 'athlete', 'athlete name', 'full name', 'competitor', 'competitor name'];
export const CLUB_KEYS = ['club', 'team', 'academy', 'gym', 'organisation', 'organization'];
export const WEIGHT_KEYS = ['weight', 'wt', 'weight class', 'weight category', 'category', 'division', 'kg', 'class'];
export const SCHOOL_KEYS = ['school'];
export const GENDER_KEYS = ['gender', 'sex', 'm/f'];

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}

export function parseDelimitedLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount >= commaCount && tabCount > 0 ? '\t' : ',';
}

export function buildRosterFromText(text: string): Athlete[] {
  const delim = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const firstCells = parseDelimitedLine(lines[0], delim).map(c => c.toLowerCase());
  let nameIdx = -1;
  let clubIdx = -1;
  let weightIdx = -1;
  let schoolIdx = -1;
  let genderIdx = -1;
  let headerRow = false;

  // 1. Exact list matching
  firstCells.forEach((c, idx) => {
    if (NAME_KEYS.includes(c)) { nameIdx = idx; headerRow = true; }
    if (CLUB_KEYS.includes(c)) { clubIdx = idx; headerRow = true; }
    if (WEIGHT_KEYS.includes(c)) { weightIdx = idx; headerRow = true; }
    if (SCHOOL_KEYS.includes(c)) { schoolIdx = idx; headerRow = true; }
    if (GENDER_KEYS.includes(c)) { genderIdx = idx; headerRow = true; }
  });

  // 2. Substring fallback matching for rich/expanded headers (e.g., 'Student Name', 'Registered Gym', etc.)
  if (nameIdx === -1) {
    nameIdx = firstCells.findIndex(c => c.includes('name') || c.includes('athlete') || c.includes('player') || c.includes('competitor'));
    if (nameIdx !== -1) headerRow = true;
  }
  if (clubIdx === -1) {
    clubIdx = firstCells.findIndex(c => c.includes('club') || c.includes('team') || c.includes('academy') || c.includes('gym') || c.includes('dojo') || c.includes('affiliation') || c.includes('organisation') || c.includes('organization'));
    if (clubIdx !== -1) headerRow = true;
  }
  if (weightIdx === -1) {
    weightIdx = firstCells.findIndex(c => c.includes('weight') || c.includes('wt') || c.includes('class') || c.includes('category') || c.includes('division') || c.includes('kg'));
    if (weightIdx !== -1) headerRow = true;
  }
  if (schoolIdx === -1) {
    schoolIdx = firstCells.findIndex(c => c.includes('school') || c.includes('college') || c.includes('university'));
    if (schoolIdx !== -1) headerRow = true;
  }
  if (genderIdx === -1) {
    genderIdx = firstCells.findIndex(c => c.includes('gender') || c.includes('sex') || c === 'm/f');
    if (genderIdx !== -1) headerRow = true;
  }

  let dataLines = lines;
  if (headerRow) {
    dataLines = lines.slice(1);
    if (nameIdx === -1) nameIdx = 0;
    if (clubIdx === -1) clubIdx = 1;
    if (weightIdx === -1) weightIdx = 2;
    // For school and gender, we don't assume index if not found in header
  } else {
    nameIdx = 0;
    clubIdx = 1;
    weightIdx = 2;
    schoolIdx = 3;
    genderIdx = 4;
  }

  const roster: Athlete[] = [];
  dataLines.forEach(line => {
    const cells = parseDelimitedLine(line, delim);
    const name = (cells[nameIdx] || '').trim();
    if (!name) return;
    const club = (cells[clubIdx] || '').trim();
    const weight = (cells[weightIdx] || '').trim() || 'Unspecified';
    const school = schoolIdx !== -1 ? (cells[schoolIdx] || '').trim() : undefined;
    const gender = genderIdx !== -1 ? (cells[genderIdx] || '').trim() : undefined;
    
    const athlete: Athlete = { name, club, weight };
    if (school) athlete.school = school;
    if (gender) athlete.gender = gender;
    
    roster.push(athlete);
  });

  return roster;
}

export function groupRoster(roster: Athlete[], existingConfigs: Record<string, { ring: number }> = {}): Record<string, WeightCategory> {
  const cats: Record<string, Athlete[]> = {};
  roster.forEach(r => {
    const key = r.weight || 'Unspecified';
    if (!cats[key]) cats[key] = [];
    cats[key].push(r);
  });

  const sortedKeys = Object.keys(cats).sort((a, b) => {
    const fa = parseFloat(a);
    const fb = parseFloat(b);
    const na = isNaN(fa);
    const nb = isNaN(fb);
    if (na && nb) return a.localeCompare(b);
    if (na) return 1;
    if (nb) return -1;
    return fa - fb;
  });

  const out: Record<string, WeightCategory> = {};
  sortedKeys.forEach(key => {
    const entrants = cats[key];
    const size = nextPow2(entrants.length);
    let status: 'ready' | 'warn' | 'bad' = 'ready';
    if (entrants.length < 1) status = 'bad';
    else if (entrants.length > 64) status = 'warn';

    const ring = existingConfigs[key]?.ring !== undefined ? existingConfigs[key].ring : 0;

    out[key] = {
      name: key,
      entrants,
      size: Math.min(size, 64),
      status,
      count: entrants.length,
      ring
    };
  });

  return out;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function findDuplicateAthletes(roster: Athlete[]): DuplicateGroup[] {
  const groups: Record<string, number[]> = {};
  roster.forEach((athlete, index) => {
    const namePart = (athlete.name || '').trim().toLowerCase();
    const clubPart = (athlete.club || '').trim().toLowerCase();
    const weightPart = (athlete.weight || '').trim().toLowerCase();
    const sig = `${namePart}||${clubPart}||${weightPart}`;
    
    if (!groups[sig]) {
      groups[sig] = [];
    }
    groups[sig].push(index);
  });

  const duplicates: DuplicateGroup[] = [];
  Object.keys(groups).forEach(sig => {
    const indices = groups[sig];
    if (indices.length > 1) {
      const firstAthlete = roster[indices[0]];
      duplicates.push({
        signature: sig,
        name: firstAthlete.name,
        club: firstAthlete.club,
        weight: firstAthlete.weight,
        indices,
        count: indices.length
      });
    }
  });

  return duplicates;
}

export function getStandardSeeding(size: number): number[] {
  let seeding = [1];
  while (seeding.length < size) {
    const nextSeeding: number[] = [];
    const targetSum = seeding.length * 2 + 1;
    for (const s of seeding) {
      nextSeeding.push(s);
      nextSeeding.push(targetSum - s);
    }
    seeding = nextSeeding;
  }
  return seeding;
}

export function buildBracketModel(entrants: Athlete[], size: number, categoryKey: string): BracketModel {
  const numRounds = Math.log2(size);
  const nodes: BracketNode[][] = [];
  const leaf: BracketNode[] = [];

  const seeding = getStandardSeeding(size);

  for (let i = 0; i < size; i++) {
    const seedVal = seeding[i];
    if (seedVal <= entrants.length) {
      const athlete = entrants[seedVal - 1];
      leaf.push({
        name: athlete.name,
        club: athlete.club,
        weight: athlete.weight,
        isBye: false,
        checked: false,
        seed: seedVal,
      });
    } else {
      leaf.push({
        name: 'BYE',
        club: '',
        weight: '',
        isBye: true,
        checked: false,
        seed: seedVal,
      });
    }
  }
  nodes.push(leaf);

  for (let k = 1; k <= numRounds; k++) {
    const prev = nodes[k - 1];
    const cur: BracketNode[] = [];
    for (let m = 0; m < prev.length / 2; m++) {
      const c1 = prev[2 * m];
      const c2 = prev[2 * m + 1];
      if (c1.isBye && c2.isBye) {
        cur.push({ name: '', club: '', weight: '', isBye: true, checked: false });
      } else if (c1.isBye && !c2.isBye) {
        c2.checked = true;
        cur.push({ name: c2.name, club: c2.club, weight: c2.weight, isBye: false, checked: false });
      } else if (!c1.isBye && c2.isBye) {
        c1.checked = true;
        cur.push({ name: c1.name, club: c1.club, weight: c1.weight, isBye: false, checked: false });
      } else {
        cur.push({ name: '', club: '', weight: '', isBye: false, checked: false });
      }
    }
    nodes.push(cur);
  }

  return { categoryKey, size, numRounds, nodes };
}

export function isRealBout(model: BracketModel, k: number, i: number): boolean {
  const c1 = model.nodes[k - 1][2 * i];
  const c2 = model.nodes[k - 1][2 * i + 1];
  return !(c1.isBye || c2.isBye);
}

export function countRealBouts(model: BracketModel): number {
  let n = 0;
  for (let k = 1; k <= model.numRounds; k++) {
    n += model.nodes[k].filter(node => typeof node.bout === 'number').length;
  }
  return n;
}

export function assignBoutNumbersForRing(brackets: Record<string, BracketModel>, keysInOrder: string[], startCounter: number = 1): number {
  if (keysInOrder.length === 0) return startCounter;

  let counter = startCounter;
  keysInOrder.forEach(key => {
    const model = brackets[key];
    if (!model) return;
    for (let k = 1; k <= model.numRounds; k++) {
      const round = model.nodes[k];
      for (let i = 0; i < round.length; i++) {
        if (isRealBout(model, k, i)) {
          model.nodes[k][i].bout = counter;
          counter++;
        } else {
          model.nodes[k][i].bout = undefined;
        }
      }
    }
  });

  return counter;
}

export function assignAllBoutNumbers(categories: Record<string, WeightCategory>, brackets: Record<string, BracketModel>): void {
  const eligibleKeys = Object.keys(categories).filter(k => brackets[k]);
  const ringGroups: Record<string, string[]> = {};

  eligibleKeys.forEach(key => {
    const ring = String(categories[key].ring || '1').trim();
    if (!ringGroups[ring]) ringGroups[ring] = [];
    ringGroups[ring].push(key);
  });

  Object.keys(ringGroups).forEach(ringKey => {
    assignBoutNumbersForRing(brackets, ringGroups[ringKey], 1);
  });
}

export function fullClear(nodes: BracketNode[][], numRounds: number, k: number, i: number): void {
  if (k > numRounds) return;
  const node = nodes[k][i];
  if (node.isBye) return;

  node.name = '';
  node.club = '';
  node.weight = '';
  node.checked = false;

  if (k < numRounds) {
    fullClear(nodes, numRounds, k + 1, Math.floor(i / 2));
  }
}

export function invalidateAbove(nodes: BracketNode[][], numRounds: number, k: number, i: number): void {
  const node = nodes[k][i];
  if (node.checked) {
    node.checked = false;
  }
  if (k < numRounds) {
    fullClear(nodes, numRounds, k + 1, Math.floor(i / 2));
  }
}

export function handleCheckboxToggle(
  brackets: Record<string, BracketModel>,
  catKey: string,
  k: number,
  i: number,
  checked: boolean
): Record<string, BracketModel> {
  // Clone state deeply using structural cloning or recursion
  const nextBrackets = JSON.parse(JSON.stringify(brackets));
  const model = nextBrackets[catKey];
  if (!model) return brackets;

  const node = model.nodes[k][i];
  node.checked = checked;

  if (checked) {
    // Uncheck sibling
    const sib = i ^ 1;
    const sibNode = model.nodes[k][sib];
    if (sibNode) {
      sibNode.checked = false;
    }

    const pk = k + 1;
    const pi = Math.floor(i / 2);
    if (pk <= model.numRounds) {
      const p = model.nodes[pk][pi];
      p.name = node.name;
      p.club = node.club;
      p.weight = node.weight;
      invalidateAbove(model.nodes, model.numRounds, pk, pi);
    }
  } else {
    const pk = k + 1;
    const pi = Math.floor(i / 2);
    if (pk <= model.numRounds) {
      fullClear(model.nodes, model.numRounds, pk, pi);
    }
  }

  return nextBrackets;
}

export function handleTextChange(
  brackets: Record<string, BracketModel>,
  catKey: string,
  k: number,
  i: number,
  text: string
): Record<string, BracketModel> {
  const nextBrackets = JSON.parse(JSON.stringify(brackets));
  const model = nextBrackets[catKey];
  if (!model) return brackets;

  const node = model.nodes[k][i];
  node.name = text;

  // If this node is checked, propagate its new name to the higher rounds
  if (node.checked) {
    const pk = k + 1;
    const pi = Math.floor(i / 2);
    if (pk <= model.numRounds) {
      const p = model.nodes[pk][pi];
      p.name = text;
      p.club = node.club;
      p.weight = node.weight;
      invalidateAbove(model.nodes, model.numRounds, pk, pi);
    }
  }

  return nextBrackets;
}

export function handleUpdateLeafNode(
  brackets: Record<string, BracketModel>,
  catKey: string,
  i: number,
  name: string,
  club: string,
  isBye: boolean
): Record<string, BracketModel> {
  const nextBrackets = JSON.parse(JSON.stringify(brackets));
  const model = nextBrackets[catKey];
  if (!model) return brackets;

  const node = model.nodes[0][i];
  if (node) {
    node.name = isBye ? 'BYE' : name;
    node.club = isBye ? '' : club;
    node.isBye = isBye;

    if (isBye) {
      node.checked = false;
    }

    const siblingIdx = i ^ 1;
    const sibling = model.nodes[0][siblingIdx];

    if (isBye && sibling && !sibling.isBye) {
      sibling.checked = true;
      const parentIdx = Math.floor(i / 2);
      model.nodes[1][parentIdx].name = sibling.name;
      model.nodes[1][parentIdx].club = sibling.club;
      model.nodes[1][parentIdx].weight = sibling.weight;
      model.nodes[1][parentIdx].isBye = false;
      invalidateAbove(model.nodes, model.numRounds, 1, parentIdx);
    } else if (!isBye && sibling && sibling.isBye) {
      node.checked = true;
      const parentIdx = Math.floor(i / 2);
      model.nodes[1][parentIdx].name = node.name;
      model.nodes[1][parentIdx].club = node.club;
      model.nodes[1][parentIdx].weight = node.weight;
      model.nodes[1][parentIdx].isBye = false;
      invalidateAbove(model.nodes, model.numRounds, 1, parentIdx);
    } else {
      const parentIdx = Math.floor(i / 2);
      if (node.checked) {
        model.nodes[1][parentIdx].name = node.name;
        model.nodes[1][parentIdx].club = node.club;
        model.nodes[1][parentIdx].isBye = false;
      } else if (sibling && sibling.checked) {
        model.nodes[1][parentIdx].name = sibling.name;
        model.nodes[1][parentIdx].club = sibling.club;
        model.nodes[1][parentIdx].isBye = false;
      } else {
        model.nodes[1][parentIdx].name = '';
        model.nodes[1][parentIdx].club = '';
        model.nodes[1][parentIdx].isBye = (node.isBye && (!sibling || sibling.isBye));
        fullClear(model.nodes, model.numRounds, 1, parentIdx);
      }
    }
  }
  return nextBrackets;
}

export function handleSwapLeafNodes(
  brackets: Record<string, BracketModel>,
  catKey: string,
  i: number,
  j: number
): Record<string, BracketModel> {
  const nextBrackets = JSON.parse(JSON.stringify(brackets));
  const model = nextBrackets[catKey];
  if (!model) return brackets;

  const nodeA = model.nodes[0][i];
  const nodeB = model.nodes[0][j];
  if (!nodeA || !nodeB) return brackets;

  const temp = {
    name: nodeA.name,
    club: nodeA.club,
    weight: nodeA.weight,
    isBye: nodeA.isBye,
    checked: nodeA.checked,
  };

  nodeA.name = nodeB.name;
  nodeA.club = nodeB.club;
  nodeA.weight = nodeB.weight;
  nodeA.isBye = nodeB.isBye;
  nodeA.checked = nodeB.checked;

  nodeB.name = temp.name;
  nodeB.club = temp.club;
  nodeB.weight = temp.weight;
  nodeB.isBye = temp.isBye;
  nodeB.checked = temp.checked;

  [i, j].forEach((idx) => {
    const parentIdx = Math.floor(idx / 2);
    const siblingIdx = idx ^ 1;
    const n = model.nodes[0][idx];
    const sib = model.nodes[0][siblingIdx];

    if (n.isBye && sib && !sib.isBye) {
      sib.checked = true;
      model.nodes[1][parentIdx].name = sib.name;
      model.nodes[1][parentIdx].club = sib.club;
      model.nodes[1][parentIdx].weight = sib.weight;
      model.nodes[1][parentIdx].isBye = false;
      invalidateAbove(model.nodes, model.numRounds, 1, parentIdx);
    } else if (!n.isBye && sib && sib.isBye) {
      n.checked = true;
      model.nodes[1][parentIdx].name = n.name;
      model.nodes[1][parentIdx].club = n.club;
      model.nodes[1][parentIdx].weight = n.weight;
      model.nodes[1][parentIdx].isBye = false;
      invalidateAbove(model.nodes, model.numRounds, 1, parentIdx);
    } else {
      if (n.checked) {
        model.nodes[1][parentIdx].name = n.name;
        model.nodes[1][parentIdx].club = n.club;
        model.nodes[1][parentIdx].weight = n.weight;
        model.nodes[1][parentIdx].isBye = false;
      } else if (sib && sib.checked) {
        model.nodes[1][parentIdx].name = sib.name;
        model.nodes[1][parentIdx].club = sib.club;
        model.nodes[1][parentIdx].weight = sib.weight;
        model.nodes[1][parentIdx].isBye = false;
      } else {
        model.nodes[1][parentIdx].name = '';
        model.nodes[1][parentIdx].club = '';
        model.nodes[1][parentIdx].isBye = (n.isBye && (!sib || sib.isBye));
        fullClear(model.nodes, model.numRounds, 1, parentIdx);
      }
    }
  });

  return nextBrackets;
}

export function applyParsedBoutNumbers(
  model: BracketModel,
  parsedBouts: { athlete1: string; athlete2: string; boutNumber: number }[]
): void {
  if (!parsedBouts || parsedBouts.length === 0) return;

  function getLeafNamesUnderNode(model: BracketModel, k: number, i: number): string[] {
    const sizeOfNodeRange = Math.pow(2, k);
    const startIdx = i * sizeOfNodeRange;
    const endIdx = startIdx + sizeOfNodeRange;
    const names: string[] = [];
    for (let idx = startIdx; idx < endIdx; idx++) {
      const leaf = model.nodes[0][idx];
      if (leaf && !leaf.isBye && leaf.name && leaf.name.trim() !== '') {
        names.push(leaf.name.trim().toLowerCase());
      }
    }
    return names;
  }

  function matchesNameResilient(athleteName: string, leafNames: string[]): boolean {
    const cleanAthlete = athleteName.trim().toLowerCase();
    if (cleanAthlete === '' || cleanAthlete === 'bye') return false;

    // Direct check
    const directMatch = leafNames.some(ln => {
      return ln === cleanAthlete || ln.includes(cleanAthlete) || cleanAthlete.includes(ln);
    });
    if (directMatch) return true;

    // Resilient fallback: split by whitespace, match words of length >= 3
    const athleteWords = cleanAthlete.split(/\s+/).filter(w => w.length >= 3);
    if (athleteWords.length === 0) return false;

    return leafNames.some(ln => {
      const lnWords = ln.split(/\s+/).filter(w => w.length >= 3);
      return athleteWords.some(aw => lnWords.includes(aw));
    });
  }

  for (let k = 1; k <= model.numRounds; k++) {
    const round = model.nodes[k];
    for (let i = 0; i < round.length; i++) {
      if (isRealBout(model, k, i)) {
        const leftLeaves = getLeafNamesUnderNode(model, k - 1, 2 * i);
        const rightLeaves = getLeafNamesUnderNode(model, k - 1, 2 * i + 1);

        const match = parsedBouts.find(pb => {
          const name1 = pb.athlete1;
          const name2 = pb.athlete2;
          return (
            (matchesNameResilient(name1, leftLeaves) && matchesNameResilient(name2, rightLeaves)) ||
            (matchesNameResilient(name2, leftLeaves) && matchesNameResilient(name1, rightLeaves))
          );
        });

        if (match) {
          round[i].bout = match.boutNumber;
        }
      }
    }
  }
}
