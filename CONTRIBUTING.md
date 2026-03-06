# Contributing to LiteParse

Thank you for your interest in contributing to LiteParse! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/liteparse.git
   cd liteparse
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

### Building

```bash
npm run build      # Build TypeScript
npm run dev        # Watch mode for development
```

### Testing

```bash
npm test           # Run tests
npm run test:watch # Run tests in watch mode
```

### Linting & Formatting

```bash
npm run lint       # Check for linting issues
npm run lint:fix   # Fix linting issues
npm run format     # Format code with Prettier
```

### Testing Local Changes

You can test your changes locally without installing globally:

```bash
# Parse a document
./dist/src/index.js parse document.pdf

# Generate screenshots
./dist/src/index.js screenshot document.pdf -o ./screenshots
```

## Making Changes

### Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs. When you make a change that should be released:

1. Run `npm run changeset`
2. Select the type of change (patch, minor, major)
3. Write a description of your changes
4. Commit the generated changeset file with your PR

**When to add a changeset:**
- Bug fixes (patch)
- New features (minor)
- Breaking changes (major)
- Performance improvements (patch or minor)

**When NOT to add a changeset:**
- Documentation-only changes
- CI/tooling changes
- Test-only changes

### Code Style

- We use TypeScript with strict mode
- Code is formatted with Prettier
- Follow existing patterns in the codebase

### Commit Messages

Use clear, descriptive commit messages. We don't enforce a specific format, but prefer:
- Start with a verb (Add, Fix, Update, Remove, etc.)
- Keep the first line under 72 characters
- Reference issues when applicable

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Add a changeset if needed (`npm run changeset`)
4. Ensure all tests pass (`npm test`)
5. Ensure linting passes (`npm run lint`)
6. Submit a pull request

### PR Guidelines

- Keep PRs focused on a single change
- Update documentation if needed
- Add tests for new functionality
- For parsing issues, include a test document if possible

## Reporting Issues

### Parsing Issues

If you're reporting a problem with document parsing:

1. **You must attach the document** or provide a way to reproduce the issue
2. Include the command you ran
3. Show the expected vs actual output
4. Include your LiteParse version (`lit --version`)

Issues without reproducible examples will be closed.

### Bug Reports

For other bugs:
1. Describe what you expected vs what happened
2. Include steps to reproduce
3. Include error messages/stack traces
4. Include version information

## Project Structure

See [AGENTS.md](AGENTS.md) for detailed documentation about the codebase structure and architecture.

Key directories:
- `src/core/` - Main orchestrator and configuration
- `src/engines/` - PDF and OCR engine implementations
- `src/processing/` - Text extraction and spatial analysis
- `src/output/` - Output formatters
- `cli/` - CLI implementation

## Questions?

- Open a [Discussion](https://github.com/run-llama/liteparse/discussions) for questions
- Check existing issues before opening new ones
- Read the [README](README.md) for usage documentation

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
