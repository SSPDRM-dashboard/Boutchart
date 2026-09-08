import re

with open('src/components/ClubReportPanel.tsx', 'r') as f:
    content = f.read()

target_url_effect = """      if (clubParam) {
        const foundClub = clubList.find(c => c.trim().toLowerCase() === clubParam.trim().toLowerCase());
        setSelectedClub(foundClub || clubParam);
      }
    } catch (e) {"""

replacement_url_effect = """      if (clubParam) {
        const foundClub = clubList.find(c => c.trim().toLowerCase() === clubParam.trim().toLowerCase());
        setSelectedClub(foundClub || clubParam);
      }
      const styleParam = urlParams.get('style');
      if (styleParam === 'photo-matrix' || styleParam === 'classic-cards' || styleParam === 'medal-standings' || styleParam === 'individual-lookup' || styleParam === 'boutchart') {
        setReportStyle(styleParam);
      }
    } catch (e) {"""

if target_url_effect in content:
    content = content.replace(target_url_effect, replacement_url_effect)
else:
    print("Failed to replace URL effect")

# Now inject `style` into all generated shareLinks
def add_style(match):
    prefix = match.group(1)
    return prefix + """
        const styleToSet = activeReportStyle;
        const uObj = new URL(shareLink);
        if (styleToSet !== 'photo-matrix') {
           uObj.searchParams.set('style', styleToSet);
        }
        shareLink = uObj.toString();
        
        setShareUrl(shareLink);"""

content = re.sub(r"(\s*)setShareUrl\(shareLink\);", add_style, content)

with open('src/components/ClubReportPanel.tsx', 'w') as f:
    f.write(content)
