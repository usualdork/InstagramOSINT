# Contributing to Instagram OSINT

Thanks for your interest in contributing.

## Setup

```bash
git clone https://github.com/usualdork/InstagramOSINT.git
cd igosint
npm install
npm run build
```

## Development

```bash
npm run dev          # Build (dev mode)
npm run dev:watch    # Watch mode
npm test             # Full test suite
npx tsc --noEmit    # Type check
```

## Code Style

- TypeScript with strict types
- Tabs for indentation
- Prettier for formatting
- XO for linting

## Pull Requests

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm test` to verify
5. Submit a PR with a clear description
