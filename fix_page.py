
import re
with open('c:/kiaan project/gulfshore/src/app/(public)/explore/[city]/page.tsx', 'r') as f:
    content = f.read()

content = content.replace('items-center', 'items-start')
content = content.replace('<Search size={20} />', '<Search size={20} className=\"flex-shrink-0 mt-[2px]\" />')

with open('c:/kiaan project/gulfshore/src/app/(public)/explore/[city]/page.tsx', 'w') as f:
    f.write(content)

