import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# State hooks
content = content.replace("  const [leftLogo, setLeftLogo] = useState<string>('');", "  const [leftLogo, setLeftLogo] = useState<string>('');\n  const [leftLogo2, setLeftLogo2] = useState<string>('');")
content = content.replace("  const [rightLogo, setRightLogo] = useState<string>('');", "  const [rightLogo, setRightLogo] = useState<string>('');\n  const [rightLogo2, setRightLogo2] = useState<string>('');")

# Firebase load (e.g. handleLoadSavedEvent etc. - wait, let's just do a regex replace for leftLogo and rightLogo)
content = re.sub(r'if \(snap\.leftLogo\) setLeftLogo\(snap\.leftLogo\);', r'if (snap.leftLogo) setLeftLogo(snap.leftLogo);\n             if (snap.leftLogo2) setLeftLogo2(snap.leftLogo2);', content)
content = re.sub(r'if \(snap\.rightLogo\) setRightLogo\(snap\.rightLogo\);', r'if (snap.rightLogo) setRightLogo(snap.rightLogo);\n             if (snap.rightLogo2) setRightLogo2(snap.rightLogo2);', content)

content = re.sub(r'if \(parsed\.leftLogo\) setLeftLogo\(parsed\.leftLogo\);', r'if (parsed.leftLogo) setLeftLogo(parsed.leftLogo);\n                if (parsed.leftLogo2) setLeftLogo2(parsed.leftLogo2);', content)
content = re.sub(r'if \(parsed\.rightLogo\) setRightLogo\(parsed\.rightLogo\);', r'if (parsed.rightLogo) setRightLogo(parsed.rightLogo);\n                if (parsed.rightLogo2) setRightLogo2(parsed.rightLogo2);', content)

content = re.sub(r'leftLogo,\s*rightLogo,', r'leftLogo,\n          leftLogo2,\n          rightLogo,\n          rightLogo2,', content)

content = re.sub(r'setLeftLogo\(target\.leftLogo \|\| \'\'\);', r'setLeftLogo(target.leftLogo || \'\');\n      setLeftLogo2(target.leftLogo2 || \'\');', content)
content = re.sub(r'setRightLogo\(target\.rightLogo \|\| \'\'\);', r'setRightLogo(target.rightLogo || \'\');\n      setRightLogo2(target.rightLogo2 || \'\');', content)

content = re.sub(r'leftLogo: updatedEvent\.leftLogo,', r'leftLogo: updatedEvent.leftLogo,\n              leftLogo2: updatedEvent.leftLogo2,', content)
content = re.sub(r'rightLogo: updatedEvent\.rightLogo,', r'rightLogo: updatedEvent.rightLogo,\n              rightLogo2: updatedEvent.rightLogo2,', content)


with open('src/App.tsx', 'w') as f:
    f.write(content)
