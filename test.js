const getStageLabel = (size, k, numRounds) => {
  if (k === numRounds) return 'CHAMPION';
  const count = size / Math.pow(2, k);
  if (count === 2) return 'FINAL';
  if (count === 4) return 'SEMI FINAL';
  if (count === 8) return 'QUARTER FINAL';
  return `ROUND OF ${count}`;
};

console.log(getStageLabel(16, 0, 4));
console.log(getStageLabel(16, 1, 4));
console.log(getStageLabel(16, 2, 4));
console.log(getStageLabel(16, 3, 4));
