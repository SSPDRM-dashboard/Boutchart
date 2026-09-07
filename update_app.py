import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. State hooks
content = content.replace(
    "const [tournamentName, setTournamentName] = useState('');",
    "const [tournamentName, setTournamentName] = useState('');\n  const [leftLogo, setLeftLogo] = useState<string>('');\n  const [rightLogo, setRightLogo] = useState<string>('');"
)

# 2. Saving to snapshot
content = content.replace(
    "tournamentName,\n          roster,",
    "tournamentName,\n          leftLogo,\n          rightLogo,\n          roster,"
)

# 3. Hydration blocks
content = content.replace(
    "if (snap.tournamentName) setTournamentName(snap.tournamentName);",
    "if (snap.tournamentName) setTournamentName(snap.tournamentName);\n             if (snap.leftLogo) setLeftLogo(snap.leftLogo);\n             if (snap.rightLogo) setRightLogo(snap.rightLogo);"
)

content = content.replace(
    "if (tName) setTournamentName(tName);",
    "if (tName) setTournamentName(tName);\n                if (parsed.leftLogo) setLeftLogo(parsed.leftLogo);\n                if (parsed.rightLogo) setRightLogo(parsed.rightLogo);"
)

# 4. Handle SaveEvent creation
content = content.replace(
    "tournamentName: finalName,",
    "tournamentName: finalName,\n          leftLogo,\n          rightLogo,"
)

content = content.replace(
    "tournamentName: updatedEvent.tournamentName",
    "tournamentName: updatedEvent.tournamentName,\n              leftLogo: updatedEvent.leftLogo,\n              rightLogo: updatedEvent.rightLogo"
)

# 5. Clear all
content = content.replace(
    "setTournamentName('');\n        setRoster([]);",
    "setTournamentName('');\n        setLeftLogo('');\n        setRightLogo('');\n        setRoster([]);"
)
content = content.replace(
    "setTournamentName('');\n      setRoster([]);",
    "setTournamentName('');\n      setLeftLogo('');\n      setRightLogo('');\n      setRoster([]);"
)

# 6. Load event
content = content.replace(
    "setTournamentName(target.tournamentName || '');",
    "setTournamentName(target.tournamentName || '');\n      setLeftLogo(target.leftLogo || '');\n      setRightLogo(target.rightLogo || '');"
)

# 7. BracketCanvas props
content = content.replace(
    "layout={bracketLayout}",
    "layout={bracketLayout}\n                            tournamentName={tournamentName}\n                            leftLogo={leftLogo}\n                            rightLogo={rightLogo}\n                            onChangeLeftLogo={setLeftLogo}\n                            onChangeRightLogo={setRightLogo}"
)


with open('src/App.tsx', 'w') as f:
    f.write(content)

