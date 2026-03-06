# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in LiteParse, please report it responsibly:

1. **Do NOT open a public issue** for security vulnerabilities
2. Email security concerns to: security@llamaindex.ai
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Scope

### In Scope

Security issues we will address:

- Remote code execution in the CLI tool or library
- Vulnerabilities in LiteParse's own code that could be exploited
- Dependency vulnerabilities with known, exploitable CVEs

### Out of Scope

LiteParse is a **local CLI tool and library** designed to process documents you provide. The following are **not** security vulnerabilities we will address:

- **Malicious input files** - Processing untrusted documents (zip bombs, malformed PDFs, path traversal in filenames, etc.) is the user's responsibility. If you're building a service that accepts untrusted uploads, you must implement your own validation, sandboxing, and resource limits.
- **Denial of service via large/complex files** - Documents that cause high memory usage, long processing times, or crashes are not security issues. Use `--max-pages`, timeouts, and resource limits in your deployment.
- **Issues requiring a server setup** - LiteParse does not include or recommend any specific server deployment. Security of web services built on top of LiteParse is the deployer's responsibility.
- **Theoretical attacks without proof of concept** - Please include a working demonstration.

### Building Secure Services

If you're exposing LiteParse through a web service or API:

1. **Validate uploads** - Check file types, sizes, and origins before processing
2. **Use sandboxing** - Run parsing in isolated containers with resource limits
3. **Set timeouts** - Don't allow unbounded processing time
4. **Limit concurrency** - Prevent resource exhaustion from parallel requests
5. **Don't trust filenames** - Sanitize any paths derived from user input

These concerns are standard for any document processing service and are outside LiteParse's scope.

## Response Timeline

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We aim to release patches for critical vulnerabilities within 30 days

## Disclosure Policy

- We will coordinate disclosure timing with reporters
- We will credit reporters in release notes (unless they prefer anonymity)
- We follow responsible disclosure practices
