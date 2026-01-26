# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - paragraph [ref=e5]: RegIntel v2
    - heading "Sign In" [level=1] [ref=e6]
    - paragraph [ref=e7]: Use your demo token to access the system.
  - generic [ref=e8]:
    - generic [ref=e9]:
      - text: Role
      - combobox "Role" [ref=e10]:
        - option "Founder" [selected]
        - option "Provider"
    - generic [ref=e11]:
      - text: Bearer Token
      - textbox "Bearer Token" [ref=e12]:
        - /placeholder: Paste token from .env
    - button "Sign In" [ref=e13] [cursor=pointer]
  - generic [ref=e14]:
    - button "Use Founder Demo Token" [ref=e15] [cursor=pointer]
    - button "Use Provider Demo Token" [ref=e16] [cursor=pointer]
```