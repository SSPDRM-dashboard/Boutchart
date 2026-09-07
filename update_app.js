const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add state hooks
content = content.replace(
  "const [tournamentName, setTournamentName] = useState('');",
  "const [tournamentName, setTournamentName] = useState('');\n  const [leftLogo, setLeftLogo] = useState('');\n  const [rightLogo, setRightLogo] = useState('');"
);

// 2. Add to snapshot saving
content = content.replace(
  "tournamentName,",
  "tournamentName,\n          leftLogo,\n          rightLogo,"
);

// 3. Add to load event from storage
content = content.replace(
  "if (snap.tournamentName) setTournamentName(snap.tournamentName);",
  "if (snap.tournamentName) setTournamentName(snap.tournamentName);\n             if (snap.leftLogo) setLeftLogo(snap.leftLogo);\n             if (snap.rightLogo) setRightLogo(snap.rightLogo);"
);

// We need to do this multiple times because it appears multiple times. Let's use global replace for state hydration
// Wait, the snapshot object is called "snap" in some places, "parsed" in others, "target" in others.

fs.writeFileSync('src/App.tsx', content);
