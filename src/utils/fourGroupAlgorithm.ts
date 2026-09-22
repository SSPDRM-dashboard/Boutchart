export interface FourGroupParticipant {
  id: string;
  name: string;
  category: string;
  club: string;
  school?: string;
  gender?: string;
  notes?: string;
}

export interface FourGroup {
  id: string;
  groupNumber: number;
  groupName: string;
  category: string;
  categoryWithGroup?: string;
  participants: FourGroupParticipant[];
  hasClubConflict: boolean;
  conflictingClubs: string[];
}

export interface CategoryGroupResult {
  category: string;
  totalParticipants: number;
  totalGroups: number;
  groups: FourGroup[];
  hasConflict: boolean;
  clubStats: { club: string; count: number }[];
}

export interface FourGroupOptions {
  maxPax?: number; // default 4
  balanceGroups?: boolean; // default true (e.g. 6 pax -> 3 & 3)
  allowExtraGroupsForClubs?: boolean; // default false
}

/**
 * Normalizes club string for collision checking (case-insensitive, trimmed)
 */
export function normalizeClub(club?: string): string {
  return (club || '').trim().toLowerCase();
}

/**
 * Checks if a club name represents an independent or unattached competitor
 */
export function isIndependentClub(club?: string): boolean {
  const c = normalizeClub(club);
  return !c || c === 'independent' || c === 'unattached' || c === '-' || c === 'n/a' || c === 'none';
}

/**
 * Maintains the category name and appends the group name after the category name.
 * e.g. "Male 12–14" and "Group 1" -> "Male 12–14 Group 1"
 * If the category already ends with the group name, avoids double suffixes.
 */
export function formatCategoryWithGroup(category: string, groupName: string): string {
  const cat = (category || '').trim();
  const grp = (groupName || '').trim();
  if (!cat) return grp || 'Group 1';
  if (!grp) return cat;

  if (cat.toLowerCase().endsWith(grp.toLowerCase())) {
    return cat;
  }
  return `${cat} ${grp}`;
}

/**
 * Automatically groups participants of a single category into groups of maximum 4 pax,
 * strictly separating participants of the same club across different groups.
 */
export function generateFourGroupsForCategory(
  category: string,
  participants: FourGroupParticipant[],
  options: FourGroupOptions = {}
): CategoryGroupResult {
  const maxPax = options.maxPax && options.maxPax > 0 ? options.maxPax : 4;
  const balanceGroups = options.balanceGroups !== false;
  const allowExtraGroupsForClubs = !!options.allowExtraGroupsForClubs;

  const totalParticipants = participants.length;
  if (totalParticipants === 0) {
    return {
      category,
      totalParticipants: 0,
      totalGroups: 0,
      groups: [],
      hasConflict: false,
      clubStats: []
    };
  }

  // Calculate club counts
  const clubCountMap: Record<string, { display: string; count: number }> = {};
  participants.forEach(p => {
    const rawClub = (p.club || 'No Club').trim();
    const norm = normalizeClub(rawClub);
    if (!clubCountMap[norm]) {
      clubCountMap[norm] = { display: rawClub, count: 0 };
    }
    clubCountMap[norm].count++;
  });

  const clubStats = Object.values(clubCountMap)
    .map(c => ({ club: c.display, count: c.count }))
    .sort((a, b) => b.count - a.count);
  const maxClubCount = Math.max(0, ...clubStats.map(c => isIndependentClub(c.club) ? 0 : c.count));

  // Determine number of groups:
  // Standard minimum groups needed so no group exceeds maxPax (4)
  const minGroupsBySize = Math.ceil(totalParticipants / maxPax);
  let numGroups = Math.max(1, minGroupsBySize);

  if (allowExtraGroupsForClubs && maxClubCount > minGroupsBySize) {
    numGroups = Math.min(totalParticipants, maxClubCount);
  }

  // Calculate capacity per group
  const targetCapacities: number[] = new Array(numGroups).fill(0);
  if (balanceGroups) {
    const baseSize = Math.floor(totalParticipants / numGroups);
    const remainder = totalParticipants % numGroups;
    for (let i = 0; i < numGroups; i++) {
      targetCapacities[i] = i < remainder ? baseSize + 1 : baseSize;
      // Cap at maxPax
      if (targetCapacities[i] > maxPax) targetCapacities[i] = maxPax;
    }
  } else {
    let remaining = totalParticipants;
    for (let i = 0; i < numGroups; i++) {
      const take = Math.min(maxPax, remaining);
      targetCapacities[i] = take;
      remaining -= take;
    }
  }

  // Initialize group objects
  const groups: FourGroup[] = Array.from({ length: numGroups }, (_, i) => ({
    id: `${category}__grp_${i + 1}__${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    groupNumber: i + 1,
    groupName: `Group ${i + 1}`,
    category,
    categoryWithGroup: formatCategoryWithGroup(category, `Group ${i + 1}`),
    participants: [],
    hasClubConflict: false,
    conflictingClubs: []
  }));

  // Group participants by club so we assign participants from largest clubs first
  const participantsByClub: Record<string, FourGroupParticipant[]> = {};
  participants.forEach(p => {
    const norm = normalizeClub(p.club);
    if (!participantsByClub[norm]) {
      participantsByClub[norm] = [];
    }
    participantsByClub[norm].push(p);
  });

  // Sort club keys: clubs with most participants come first; independent clubs come last
  const sortedClubNorms = Object.keys(participantsByClub).sort((a, b) => {
    const isIndA = isIndependentClub(a);
    const isIndB = isIndependentClub(b);
    if (isIndA && !isIndB) return 1;
    if (!isIndA && isIndB) return -1;
    return participantsByClub[b].length - participantsByClub[a].length;
  });

  // Assign participants to groups
  sortedClubNorms.forEach(clubNorm => {
    const clubAthletes = participantsByClub[clubNorm];
    const isInd = isIndependentClub(clubNorm);

    clubAthletes.forEach((athlete) => {
      // Find best group for this athlete
      let bestGroupIndex = -1;
      let lowestScore = Infinity;

      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];
        const currentCount = group.participants.length;
        const targetCap = targetCapacities[gIdx];

        // Strict limit: never exceed maxPax
        if (currentCount >= maxPax) continue;

        // Check club presence
        const sameClubCount = isInd
          ? 0
          : group.participants.filter(p => normalizeClub(p.club) === clubNorm).length;

        // Scoring:
        // Priority 1: Zero same-club collisions (heavy weight: 100,000)
        // Priority 2: Stay within target capacity (weight: 1,000)
        // Priority 3: Balance overall group size (weight: 10)
        // Priority 4: Slight tie-breaker for lower index (weight: 1)
        const exceedsTarget = currentCount >= targetCap ? 1 : 0;
        const score = 
          (sameClubCount * 100000) + 
          (exceedsTarget * 1000) + 
          (currentCount * 10) + 
          gIdx;

        if (score < lowestScore) {
          lowestScore = score;
          bestGroupIndex = gIdx;
        }
      }

      // Fallback: If all groups are at target cap, pick any group with size < maxPax
      if (bestGroupIndex === -1) {
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
          if (groups[gIdx].participants.length < maxPax) {
            bestGroupIndex = gIdx;
            break;
          }
        }
      }

      // If still no slot (should never happen because numGroups >= ceil(N/maxPax)), push to least full group
      if (bestGroupIndex === -1) {
        bestGroupIndex = groups.reduce((minIdx, g, idx, arr) => 
          g.participants.length < arr[minIdx].participants.length ? idx : minIdx, 0);
      }

      groups[bestGroupIndex].participants.push(athlete);
    });
  });

  // Calculate conflict status for each group
  let categoryHasConflict = false;
  groups.forEach(group => {
    const clubOccurrences: Record<string, number> = {};
    const conflicts: string[] = [];

    group.participants.forEach(p => {
      const norm = normalizeClub(p.club);
      if (isIndependentClub(norm)) return;
      clubOccurrences[norm] = (clubOccurrences[norm] || 0) + 1;
      if (clubOccurrences[norm] === 2) {
        conflicts.push(p.club || 'Same Club');
      }
    });

    group.hasClubConflict = conflicts.length > 0;
    group.conflictingClubs = conflicts;
    if (group.hasClubConflict) {
      categoryHasConflict = true;
    }
  });

  return {
    category,
    totalParticipants,
    totalGroups: groups.length,
    groups,
    hasConflict: categoryHasConflict,
    clubStats
  };
}

/**
 * Groups an entire roster of participants across all categories.
 * Participants from different categories are NEVER mixed.
 */
export function generateFourGroupsForAllCategories(
  participants: FourGroupParticipant[],
  options: FourGroupOptions = {}
): Record<string, CategoryGroupResult> {
  // Group by category while preserving first-seen sequence order from the CSV file
  const categoryKeys: string[] = [];
  const categorized: Record<string, FourGroupParticipant[]> = {};

  participants.forEach(p => {
    const cat = (p.category || 'Uncategorized').trim();
    if (!categorized[cat]) {
      categorized[cat] = [];
      categoryKeys.push(cat);
    }
    categorized[cat].push(p);
  });

  const results: Record<string, CategoryGroupResult> = {};

  categoryKeys.forEach(cat => {
    results[cat] = generateFourGroupsForCategory(cat, categorized[cat], options);
  });

  return results;
}

/**
 * Flattens all grouped results into standard row objects matching the user's prompt:
 * [Group, Category, Participant, Club, School, Notes]
 */
export function flattenGroupsToRows(results: Record<string, CategoryGroupResult>): {
  participantId: string;
  groupId: string;
  group: string;
  category: string;
  baseCategory: string;
  participant: string;
  club: string;
  school?: string;
  gender?: string;
  notes?: string;
  hasConflict?: boolean;
}[] {
  const rows: {
    participantId: string;
    groupId: string;
    group: string;
    category: string;
    baseCategory: string;
    participant: string;
    club: string;
    school?: string;
    gender?: string;
    notes?: string;
    hasConflict?: boolean;
  }[] = [];

  Object.values(results).forEach(catRes => {
    catRes.groups.forEach(group => {
      const formattedCategoryWithGroup = formatCategoryWithGroup(catRes.category, group.groupName);
      group.participants.forEach(p => {
        rows.push({
          participantId: p.id,
          groupId: group.id,
          group: group.groupName,
          category: formattedCategoryWithGroup,
          baseCategory: catRes.category,
          participant: p.name,
          club: p.club,
          school: p.school,
          gender: p.gender,
          notes: p.notes,
          hasConflict: group.hasClubConflict
        });
      });
    });
  });

  return rows;
}

/**
 * Recalculates same-club collision status for a single group.
 */
export function recalculateGroupConflicts(group: FourGroup): FourGroup {
  const clubOccurrences: Record<string, number> = {};
  const conflicts: string[] = [];

  group.participants.forEach(p => {
    const norm = normalizeClub(p.club);
    if (isIndependentClub(norm)) return;
    clubOccurrences[norm] = (clubOccurrences[norm] || 0) + 1;
    if (clubOccurrences[norm] === 2) {
      conflicts.push(p.club || 'Same Club');
    }
  });

  return {
    ...group,
    hasClubConflict: conflicts.length > 0,
    conflictingClubs: conflicts,
  };
}

/**
 * Recalculates category-level statistics and conflicts after manual group moves or swaps.
 */
export function recalculateCategoryResult(catRes: CategoryGroupResult): CategoryGroupResult {
  const updatedGroups = catRes.groups.map(g => {
    const base = recalculateGroupConflicts(g);
    return {
      ...base,
      categoryWithGroup: formatCategoryWithGroup(catRes.category, g.groupName)
    };
  });
  const hasConflict = updatedGroups.some(g => g.hasClubConflict);
  const totalParticipants = updatedGroups.reduce((sum, g) => sum + g.participants.length, 0);

  // Recalculate club counts
  const clubCountMap: Record<string, { club: string; count: number }> = {};
  updatedGroups.forEach(g => {
    g.participants.forEach(p => {
      const rawClub = (p.club || 'No Club').trim();
      const norm = normalizeClub(rawClub);
      if (!clubCountMap[norm]) {
        clubCountMap[norm] = { club: rawClub, count: 0 };
      }
      clubCountMap[norm].count++;
    });
  });

  const clubStats = Object.values(clubCountMap).sort((a, b) => b.count - a.count);

  return {
    ...catRes,
    groups: updatedGroups,
    hasConflict,
    totalParticipants,
    totalGroups: updatedGroups.length,
    clubStats
  };
}

