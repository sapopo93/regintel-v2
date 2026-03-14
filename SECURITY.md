# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in RegIntel v2, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email security concerns to the repository maintainers via the contact information in the repository
2. Include a description of the vulnerability, steps to reproduce, and potential impact
3. If possible, include a suggested fix

### What to Expect

- **Acknowledgment:** Within 48 hours of your report
- **Assessment:** Within 7 days, we will provide an initial assessment of the vulnerability
- **Resolution:** Critical vulnerabilities will be patched within 14 days. Lower severity issues will be addressed in the next scheduled release.

### Responsible Disclosure

We ask that you:
- Allow us reasonable time to address the issue before public disclosure
- Do not access or modify other users' data
- Do not perform actions that could degrade the service for other users
- Act in good faith to avoid privacy violations, data destruction, or service interruption

### Scope

The following are in scope:
- Authentication and authorization bypass
- Cross-tenant data access
- Injection vulnerabilities (SQL, XSS, command injection)
- Sensitive data exposure
- Audit log tampering

The following are out of scope:
- Denial of service attacks
- Social engineering
- Physical security
- Issues in third-party dependencies (report these to the upstream project)

### Recognition

We appreciate the security research community's efforts. Reporters who follow responsible disclosure will be acknowledged in our release notes (unless anonymity is preferred).
